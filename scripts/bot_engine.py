"""Local robot engine: memory-only keys, durable signed hashes, no payment retries/Blob."""
import argparse,collections,json,math,os,secrets,time,uuid,threading
from concurrent.futures import ThreadPoolExecutor
import httpx
from web3 import Web3
from niuma import ROOT,RUNTIME,chain,save,safe_error

def execute(n=100,mode='spread',version='v2'):
 if not 1<=n<=100 or mode not in ('hot','spread'):raise ValueError('Invalid batch')
 private_dir=ROOT.parent/'.bot-runtime';private_dir.mkdir(exist_ok=True)
 if list(private_dir.glob('*.json')):raise RuntimeError('Prior batch keys remain: reconcile original hashes before any new funding')
 started=time.time();bid=str(uuid.uuid4());path=ROOT/f'evidence/stress-{time.strftime("%Y%m%d-%H%M%S")}-{mode}-{bid[:8]}.json'
 lock=RUNTIME/'bot-rush.lock';fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY);os.write(fd,bid.encode());os.close(fd)
 batch=dict(batchId=bid,count=n,mode=mode,version=version,startedAt=int(started*1000),phase='preflight',rows=[],sent=0,successful=0,failed=0,unknown=0,averageMs=None,totalMs=0,rpcFailures=[],broadcastHttpRetries=0,transactionResubmissions=0,broadcastConcurrency=2,broadcastChunkSize=20);keys=[]
 (private_dir/'.gitignore').write_text('*\n');key_path=private_dir/f'{bid}.json';private_record={'batchId':bid,'keys':[],'fundingRaw':[],'runRaw':[]}
 try:
  w3,_=chain();suffix='V2' if version=='v2' else ''
  dep=json.loads((ROOT/f'evidence/deployment{"-v2" if suffix else ""}.json').read_text(encoding='utf-8-sig'))
  artifact=json.loads((ROOT/f'packages/foundry/out/NiumaWorks{suffix}.sol/NiumaWorks{suffix}.json').read_text())
  contract=w3.eth.contract(address=Web3.to_checksum_address(dep['address']),abi=artifact['abi'])
  deployer=w3.eth.account.from_key(os.environ['DEPLOYER_PRIVATE_KEY']);ids=[1,2,3] if suffix else [5,6,7]
  fee=contract.functions.playFee().call();gas_price=w3.eth.gas_price;amount=w3.to_wei('0.013','ether')
  batch.update(contract=dep['address'],chainId=10143,deployer=deployer.address,balanceBeforeWei=str(w3.eth.get_balance(deployer.address)),fundingPerWalletWei=str(amount),playFeeWei=str(fee),gasPriceWei=str(gas_price))
  if int(batch['balanceBeforeWei'])<n*(amount+21000*gas_price):raise ValueError('Insufficient deployer budget; no funding started')
  for cid in ids:
   c=contract.functions.characters(cid).call()
   if contract.functions.orders(c[3]).call()[3]!=2:raise ValueError('Demo character is not Paid')
   estimate=contract.functions.finishRun(cid,6,15000).estimate_gas({'from':deployer.address,'value':fee})
   if fee+((estimate*110+99)//100)*gas_price>amount:raise ValueError(f'Preflight: 0.013 MON insufficient for character {cid}; no funding started')
  batch['preflight']='PASS: chain, paid characters, funding budget and estimated 110% gas cap'
  print(json.dumps({k:batch[k] for k in ('batchId','count','mode','version','balanceBeforeWei')}),flush=True)
  for i in range(n):
   account=w3.eth.account.create();keys.append(account)
   batch['rows'].append(dict(index=i+1,address=account.address,characterId=ids[0] if mode=='hot' else ids[i%3],stars=3+secrets.randbelow(4),timeMs=15000+secrets.randbelow(45001),state='CREATED'))
  private_record['keys']=[a.key.hex() for a in keys];save(key_path,private_record)
  for account in keys:
   signed=account.sign_transaction(dict(to=deployer.address,value=0,gas=21000,nonce=0,chainId=10143,type=2,maxFeePerGas=gas_price,maxPriorityFeePerGas=w3.to_wei(2,'gwei')))
   if w3.eth.account.recover_transaction(signed.raw_transaction)!=account.address:raise ValueError('Local signature preflight failed; no funding')
  batch['privateKeys']='PERSISTED_OUTSIDE_REPOSITORY_UNTIL_TERMINAL';batch['phase']='funding'
  save(path,batch)
  for row in batch['rows']:
   nonce=w3.eth.get_transaction_count(deployer.address,'pending')
   signed=deployer.sign_transaction(dict(to=row['address'],value=amount,gas=21000,nonce=nonce,chainId=10143,type=2,maxFeePerGas=gas_price,maxPriorityFeePerGas=w3.to_wei(2,'gwei')))
   private_record['fundingRaw'].append(dict(hash=Web3.to_hex(signed.hash),raw=Web3.to_hex(signed.raw_transaction),nonce=nonce));save(key_path,private_record)
   row.update(fundingHash=Web3.to_hex(signed.hash),fundingNonce=nonce,fundingGasLimit=21000,state='FUNDING_PRE_BROADCAST');save(path,batch)
   try:
    w3.eth.send_raw_transaction(signed.raw_transaction);r=w3.eth.wait_for_transaction_receipt(signed.hash,timeout=45,poll_latency=.5)
    if r['status']!=1:raise ValueError('Funding reverted')
    row.update(state='FUNDED',fundingBlockNumber=r['blockNumber'],fundingFeeWei=str(21000*r['effectiveGasPrice']));save(path,batch)
   except Exception as e:
    row.update(state='UNKNOWN',reason=safe_error(e)[:240]);raise RuntimeError('Funding outcome unresolved; batch stopped without retry') from None
  rpc=os.getenv('MONAD_RPC_URL','https://testnet-rpc.monad.xyz')
  def rpc_batch(method,params):
   try:
    response=httpx.post(rpc,json=[dict(jsonrpc='2.0',id=i,method=method,params=p) for i,p in enumerate(params)],timeout=20);response.raise_for_status();body=response.json()
   except Exception as error:
    batch['rpcFailures'].append(dict(stage=method,kind='HTTP' if isinstance(error,httpx.HTTPStatusError) else type(error).__name__,httpStatus=error.response.status_code if isinstance(error,httpx.HTTPStatusError) else None,error=safe_error(error)[:180]))
    raise
   if not isinstance(body,list):raise ValueError('RPC did not return a batch')
   return {r['id']:r for r in body}
  estimates=rpc_batch('eth_estimateGas',[[{'from':r['address'],'to':dep['address'],'value':hex(fee),'data':contract.functions.finishRun(r['characterId'],r['stars'],r['timeMs'])._encode_transaction_data()}] for r in batch['rows']]);raw=[]
  for i,(row,account) in enumerate(zip(batch['rows'],keys)):
   result=estimates.get(i,{})
   if 'result' not in result:row.update(state='FAILED',reason='Estimate failed: '+str(result.get('error','missing response'))[:180]);continue
   estimate=int(result['result'],16);gas=(estimate*110+99)//100
   if fee+gas*gas_price>amount:row.update(state='FAILED',reason=f'0.013 MON insufficient for fee + gas limit {gas}');continue
   tx=contract.functions.finishRun(row['characterId'],row['stars'],row['timeMs']).build_transaction({'from':account.address,'value':fee,'nonce':0,'chainId':10143,'gas':gas,'type':2,'maxFeePerGas':gas_price,'maxPriorityFeePerGas':w3.to_wei(2,'gwei')})
   signed=account.sign_transaction(tx);row.update(hash=Web3.to_hex(signed.hash),nonce=0,estimateGas=estimate,gasLimit=str(gas),gasPriceWei=str(gas_price),state='PRE_BROADCAST');raw.append((row,Web3.to_hex(signed.raw_transaction)))
  private_record['runRaw']=[dict(hash=row['hash'],raw=serialized) for row,serialized in raw];save(key_path,private_record)
  batch['phase']='settling';save(path,batch) # COMMIT all original signed hashes BEFORE any broadcast
  first=time.time()
  for row,_ in raw:row.update(submittedAt=int(first*1000),state='PENDING')
  batch['sent']=len(raw);save(path,batch)
  def broadcast(chunk):
   for attempt in range(4):
    for row,_ in chunk:row['broadcastAttempts']=attempt+1
    if attempt:
     batch['broadcastHttpRetries']+=1;batch['transactionResubmissions']+=len(chunk);time.sleep(min(2**(attempt-1),4))
    try:
     responses=rpc_batch('eth_sendRawTransaction',[[r] for _,r in chunk]);retry=[]
     for i,(row,serialized) in enumerate(chunk):
      result=responses.get(i,{})
      if 'error' in result:
       message=str(result['error']);batch['rpcFailures'].append(dict(stage='eth_sendRawTransaction',kind='JSON_RPC',hash=row['hash'],error=message[:240]))
       row.update(state='UNKNOWN',reason='RPC admission response: '+message[:180])
       if any(word in message.lower() for word in ['429','rate limit','too many']):retry.append((row,serialized))
      elif result.get('result','').lower()!=row['hash'].lower():row.update(state='UNKNOWN',reason='Broadcast response missing or hash mismatch')
     if not retry:return
     chunk=retry
    except Exception as error:
     retryable=isinstance(error,(httpx.ConnectError,httpx.TimeoutException,httpx.RemoteProtocolError)) or isinstance(error,httpx.HTTPStatusError) and error.response.status_code==429
     for row,_ in chunk:row.update(state='UNKNOWN',reason='Broadcast outcome unknown: '+safe_error(error)[:180])
     if not retryable:return
  with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(broadcast,[raw[i:i+20] for i in range(0,len(raw),20)]))
  save(path,batch)
  for _ in range(35):
   pending=[r for r,_ in raw if r['state'] in ('PENDING','UNKNOWN')]
   if not pending:break
   try:
    results=rpc_batch('eth_getTransactionReceipt',[[r['hash']] for r in pending]);observed=int(time.time()*1000)
    for i,row in enumerate(pending):
     r=results.get(i,{}).get('result')
     if r:
      row.update(state='CONFIRMED' if int(r['status'],16)==1 else 'FAILED',blockNumber=int(r['blockNumber'],16),elapsedMs=observed-row['submittedAt'],confirmedAt=observed,gasUsed=int(r['gasUsed'],16),effectiveGasPriceWei=str(int(r['effectiveGasPrice'],16)),chargedFeeWei=str(int(row['gasLimit'])*int(r['effectiveGasPrice'],16)))
      if row['state']=='FAILED':row['reason']='Execution reverted'
   except Exception as e:batch['receiptReadWarning']=safe_error(e)[:160]
   save(path,batch)
   if any(r['state'] in ('PENDING','UNKNOWN') for r,_ in raw):time.sleep(1)
  for row,_ in raw:
   if row['state']=='PENDING':row.update(state='UNKNOWN',reason='Receipt deadline exceeded; original hash retained, no retry')
  times=sorted(r['elapsedMs'] for r in batch['rows'] if r['state']=='CONFIRMED');blocks=collections.Counter(r['blockNumber'] for r in batch['rows'] if r['state']=='CONFIRMED');per_second=collections.Counter()
  if blocks:
   results=rpc_batch('eth_getBlockByNumber',[[hex(b),False] for b in blocks])
   for i,b in enumerate(blocks):
    r=results.get(i,{}).get('result')
    if r:per_second[int(r['timestamp'],16)]+=blocks[b]
  batch.update(phase='complete',successful=len(times),failed=sum(r['state']=='FAILED' for r in batch['rows']),unknown=sum(r['state']=='UNKNOWN' for r in batch['rows']),averageMs=round(sum(times)/len(times)) if times else None,p95Ms=times[math.ceil(.95*len(times))-1] if times else None,maxSameBlock=max(blocks.values(),default=0),blockCounts=dict(blocks),peakTxPerSecond=max(per_second.values(),default=0),peakDefinition='Successful transactions grouped by on-chain block timestamp second; not chain capacity',settlementSpanMs=max((r.get('confirmedAt',int(first*1000)) for r,_ in raw),default=int(first*1000))-int(first*1000),totalGasWei=str(sum(int(r.get('chargedFeeWei','0')) for r in batch['rows'])),fundingGasWei=str(sum(int(r.get('fundingFeeWei','0')) for r in batch['rows'])),finishedAt=int(time.time()*1000),totalMs=round((time.time()-started)*1000),timingMethod='One batched submission barrier; batched receipt observations include RPC/polling delay; not finality')
  batch['rpcFailureCount']=len(batch['rpcFailures']);batch['chainFailureCount']=sum(r.get('reason')=='Execution reverted' for r in batch['rows'])
  batch['conclusion']='公共 RPC 层出现失败；若为429则瓶颈在公共 RPC 的限流，不代表链的吞吐上限。' if batch['rpcFailureCount'] else '本批未观察到 RPC 层失败；本次结果不代表链的吞吐上限。'
 except Exception as e:
  batch.update(phase='blocked',error=safe_error(e)[:240],finishedAt=int(time.time()*1000),totalMs=round((time.time()-started)*1000));batch['unknown']=sum(r['state']=='UNKNOWN' for r in batch['rows']);batch['failed']=sum(r['state']=='FAILED' for r in batch['rows'])
 finally:
  if batch['rows'] and all(r['state'] in ('CONFIRMED','FAILED') for r in batch['rows']):
   key_path.unlink(missing_ok=True);batch['privateKeys']='DELETED_AFTER_ALL_TERMINAL'
  elif key_path.exists():batch['privateKeys']='RETAINED_OUTSIDE_REPOSITORY_FOR_RECONCILIATION'
  keys.clear();save(path,batch);lock.unlink(missing_ok=True);target=ROOT/'packages/nextjs/contracts/botResults.json';previous=json.loads(target.read_text(encoding='utf-8-sig')) if target.exists() else [];previous.append(batch);save(target,previous)
  print(json.dumps({k:v for k,v in batch.items() if k!='rows'},ensure_ascii=False),flush=True)
 return batch
