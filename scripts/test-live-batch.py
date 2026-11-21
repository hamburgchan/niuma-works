"""Real two-phase HTTP N=100 test with 500ms live receipt polling."""
import concurrent.futures,json,time,math
from niuma import ROOT,chain,save,now,safe_error
import httpx,os
try:
    code=(ROOT.parent/'.demo-local-code').read_text().strip();base='http://127.0.0.1:3000'
    w,_=chain();owner=w.eth.account.from_key(os.environ['DEPLOYER_PRIVATE_KEY']).address
    balance=str(w.from_wei(w.eth.get_balance(owner),'ether'));print(json.dumps({'deployer':owner,'balanceMON':balance,'count':100,'test':'two-phase live HTTP'}),flush=True)
    client=httpx.Client(timeout=290)
    preparation=client.post(base+'/api/bots',json={'code':code,'count':100,'action':'prepare'})
    data=preparation.json();assert preparation.status_code==200,data
    prepared=data['prepared'];bid=prepared['batchId'];target=ROOT/'evidence'/('live-batch-'+bid[2:10]+'.json')
    record={'startedAt':now(),'scope':'localhost server HTTP with real Monad transactions; 500ms progress GET; no production demo code known','deployerBalanceMON':balance,'prepared':prepared,'polls':[]}
    save(target,record)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        result_future=pool.submit(client.post,base+'/api/bots',json={'code':code,'count':100,'action':'run','batchId':bid,'fundingHash':prepared['fundingHash']})
        while not result_future.done():
            started=time.monotonic();response=client.get(base+'/api/bots/progress',params={'fundingHash':prepared['fundingHash']});value=response.json()
            point={'at':now(),'httpStatus':response.status_code,'confirmed':value.get('confirmed'),'blockCount':value.get('blockCount'),'chainSpanSeconds':value.get('chainSpanSeconds'),'requestMs':round((time.monotonic()-started)*1000)}
            record['polls'].append(point);save(target,record);print(json.dumps(point),flush=True)
            time.sleep(max(0,.5-(time.monotonic()-started)))
        response=result_future.result();result=response.json();record['runStatus']=response.status_code;record['result']=result
    assert response.status_code==200,result
    batch=result['batch'];record['finishedAt']=now();save(target,record)
    assert batch['successful']==100 and batch['failed']==0 and batch['unknown']==0
    assert len(batch['rows'])==100 and all('sentAt' in row and 'elapsedMs' in row for row in batch['rows'])
    assert sum(b['count'] for b in batch['blocks'])==100
    assert batch['chainSpanSeconds']==batch['blocks'][-1]['timestamp']-batch['blocks'][0]['timestamp']
    assert batch['averageMs']==math.floor(sum(row['elapsedMs'] for row in batch['rows'])/100+.5)
    record['assertions']='PASS: 100 original receipts, per-row clocks, exact block histogram/timestamp span'
    save(target,record)
    lines=['# Live batch '+bid,'','Funding: https://testnet.monadexplorer.com/tx/'+prepared['fundingHash'],'']
    lines += [f"- #{r['index']} · character {r['characterId']} · block {r['blockNumber']} · {r['elapsedMs']} ms · https://testnet.monadexplorer.com/tx/{r['hash']}" for r in batch['rows']]
    (ROOT/'evidence'/('live-batch-transactions-'+bid[2:10]+'.md')).write_text('\n'.join(lines)+'\n')
    print(json.dumps({k:batch.get(k) for k in ['batchId','sent','successful','failed','unknown','blockCount','chainSpanSeconds','averageMs','p95Ms','totalMs','timingSamples','rpcFailureCount','transactionResubmissions']}),flush=True)
except Exception as e:
    print(safe_error(e));raise SystemExit(1)
