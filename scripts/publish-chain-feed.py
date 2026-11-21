"""Publish a verified event seed and receipt audit; read-only RPC, no Blob."""
import json,os,httpx
from hexbytes import HexBytes
from niuma import ROOT,chain,save,now
w,_=chain();d=json.loads((ROOT/'evidence/deployment-v2.json').read_text());a=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text());c=w.eth.contract(address=d['address'],abi=a['abi']);latest=w.eth.block_number;first=int(d['blockNumberHex'],16)
requests=[dict(jsonrpc='2.0',id=i,method='eth_getLogs',params=[dict(address=d['address'],fromBlock=hex(start),toBlock=hex(min(start+99,latest)))]) for i,start in enumerate(range(first,latest+1,100))]
logs=[]
for offset in range(0,len(requests),50):
 response=httpx.post(os.getenv('MONAD_RPC_URL','https://testnet-rpc.monad.xyz'),json=requests[offset:offset+50],timeout=40);response.raise_for_status()
 for item in response.json():
  if 'error' in item:raise RuntimeError(str(item['error']))
  logs.extend(item['result'])
events=[]
for log in logs:
 for name in ['Paid','RunFinished']:
  try:
   decoded=getattr(c.events,name)().process_log({**log,'topics':[HexBytes(v) for v in log['topics']],'data':HexBytes(log['data'])})
  except Exception:continue
  args={k:[str(i) for i in v] if isinstance(v,list) else str(v) for k,v in decoded['args'].items()}
  events.append(dict(id=f"{log['transactionHash']}:{int(log['logIndex'],16)}",hash=log['transactionHash'],blockNumber=int(log['blockNumber'],16),logIndex=int(log['logIndex'],16),event=name,args=args))
events.sort(key=lambda e:(e['blockNumber'],e['logIndex']))
seed=dict(contract=d['address'],cursor=latest+1,events=events,source='Monad testnet eth_getLogs; 100-block ranges; read-only',at=now());save(ROOT/'packages/nextjs/contracts/liveSeed.json',seed);save(ROOT/'evidence/v2/event-feed.json',seed)
batches=json.loads((ROOT/'packages/nextjs/contracts/botResults.json').read_text(encoding='utf-8-sig'));by_hash={e['hash'].lower():e for e in events if e['event']=='RunFinished'}
rows=[]
for batch in batches:
 if batch.get('contract','').lower()!=d['address'].lower():continue
 for row in batch['rows']:
  if row['state']!='CONFIRMED':continue
  event=by_hash.get(row['hash'].lower())
  if not event or int(event['args']['characterId'])!=row['characterId'] or int(event['args']['stars'])!=row['stars'] or event['args']['player'].lower()!=row['address'].lower():raise ValueError('Original hash/event mismatch')
  rows.append(dict(batchId=batch['batchId'],hash=row['hash'],characterId=row['characterId'],blockNumber=event['blockNumber'],ownerShareWei=event['args']['ownerShare']))
report=dict(at=now(),contract=d['address'],verifiedRunEvents=len(rows),scope='Original transaction hash, player, character and stars checked against chain events; not an independent performance replication',rows=rows);save(ROOT/'evidence/v2/stress-event-audit.json',report)
print(json.dumps({'eventCount':len(events),'verifiedRunEvents':len(rows),'indexedThrough':latest}))
