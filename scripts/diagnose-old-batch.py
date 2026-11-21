"""Read-only original-ID audit; never signs or sends transactions."""
import json,httpx
from niuma import ROOT,chain,save,now
w,c=chain();b=json.loads((ROOT/'evidence/bots/b4477613-1a3a-4451-bb44-dd5dbf9f51dd.json').read_text())
requests=[]
for i,r in enumerate(b['rows']):
 for j,(method,params) in enumerate([('eth_getTransactionCount',[r['address'],'pending']),('eth_getBalance',[r['address'],'latest']),('eth_estimateGas',[{'from':r['address'],'to':c.address,'value':hex(10**15),'data':c.encode_abi('finishRun',args=[r['characterId'],r['stars'],r['timeMs']])}])]):requests.append(dict(jsonrpc='2.0',id=i*3+j,method=method,params=params))
response=httpx.post('https://testnet-rpc.monad.xyz',json=requests,timeout=45);response.raise_for_status();results={r['id']:r for r in response.json()}
rows=[]
for i,r in enumerate(b['rows']):
 rows.append(dict(address=r['address'],fundingHash=r['fundingHash'],nonce=int(results[i*3]['result'],16),balanceWei=str(int(results[i*3+1]['result'],16)),estimateGas=int(results[i*3+2]['result'],16) if 'result' in results[i*3+2] else None,originalError=r.get('reason'),signedHashPresent=bool(r.get('hash')),broadcastTimestampPresent=bool(r.get('submittedAt'))))
report=dict(at=now(),batchId=b['batchId'],status='FAILED_PRESERVED',fundedWei=str(30*12*10**15),fundedMON='0.36',unrecoverableWei=str(sum(int(r['balanceWei']) for r in rows)),privateKeys='LOST: prior implementation kept keys only in request memory; cannot recover funds',observedFailure='All 30 HTTP transport failures occurred before signed hash and broadcast timestamp were recorded. No finishRun was sent. Exact failing read method/HTTP status was not retained.',nonceFinding='All original accounts remain nonce 0' if all(r['nonce']==0 for r in rows) else 'See rows',gasFinding='Read-only batched estimates succeed' if all(r['estimateGas'] for r in rows) else 'See rows',signatureFinding='No signed finishRun hash was recorded; no evidence of rejected signature or execution revert',rootCauseLimit='Transport failure before signing is confirmed. Whether rate limit, timeout or connection error caused it is UNKNOWN; do not claim HTTP 429.',fix=['One JSON-RPC HTTP batch per preparation/broadcast/read stage, no 30-way separate HTTP fanout','Paid/gas/budget and signing checks before funding','Original hashes durably stored before barrier broadcast','Temporary private keys persisted outside repository until every row is terminal; unknown outcomes retain keys','HTTP errors retain status and stage; no payment retries'],httpStatus=response.status_code,rows=rows)
save(ROOT/'evidence/bots/failed-30-postmortem.json',report)
print(json.dumps({k:v for k,v in report.items() if k!='rows'},ensure_ascii=False))
