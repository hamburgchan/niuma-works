"""Real localhost HTTP acceptance. No test password or wallet keys are published."""
import json, time
import httpx
from eth_account import Account
from eth_account.messages import encode_defunct
from niuma import ROOT, chain, save, safe_error, now

def run():
    w3, _ = chain()
    code = (ROOT.parent/'.demo-local-code').read_text().strip()
    base = 'http://127.0.0.1:3000'
    client = httpx.Client(timeout=290)
    evidence={'startedAt':now(), 'testType':'localhost HTTP integration with real Monad testnet transactions', 'productionCodeKnown':False}
    bad=client.post(base+'/api/bots',json={'code':'deliberately-incorrect','count':100})
    evidence['wrongCodeStatus']=bad.status_code
    assert bad.status_code==403
    excessive=client.post(base+'/api/bots',json={'code':code,'count':101})
    evidence['excessiveCountStatus']=excessive.status_code
    assert excessive.status_code==503
    user=Account.create()
    issued=int(time.time()*1000)
    message=f'NIUMA WORKS opening grant\nchainId: 10143\naddress: {user.address}\nissuedAt: {issued}'
    body={'address':user.address,'issuedAt':issued,'signature':'0x'+Account.sign_message(encode_defunct(text=message),user.key).signature.hex()}
    response=client.post(base+'/api/faucet',json=body)
    grant=response.json()
    evidence['faucet']={'address':user.address,'response':grant,'status':response.status_code,'balanceWei':str(w3.eth.get_balance(user.address))}
    save(ROOT/'evidence/server-demo-acceptance.json',evidence)
    assert response.status_code==200 and grant['state']=='CONFIRMED', grant
    assert w3.eth.get_balance(user.address)==20000000000000000
    duplicate=client.post(base+'/api/faucet',json=body).json()
    evidence['duplicate']=duplicate
    assert duplicate['state']=='ALREADY_CLAIMED'
    assert w3.eth.get_balance(user.address)==20000000000000000
    deployer=w3.eth.account.from_key(__import__('os').environ['DEPLOYER_PRIVATE_KEY']).address
    evidence['deployerBalanceBeforeBatchWei']=str(w3.eth.get_balance(deployer))
    save(ROOT/'evidence/server-demo-acceptance.json',evidence)
    print(json.dumps({'faucet':'PASS','deployerBalanceMON':str(w3.from_wei(w3.eth.get_balance(deployer),'ether')),'next':'N=100 server-side spread batch'}),flush=True)
    response=client.post(base+'/api/bots',json={'code':code,'count':100})
    result=response.json()
    evidence['botsStatus']=response.status_code
    evidence['bots']=result
    evidence['finishedAt']=now()
    save(ROOT/'evidence/server-demo-acceptance.json',evidence)
    assert response.status_code==200, result
    batch=result['batch']
    print(json.dumps({key:batch.get(key) for key in ['batchId','sent','successful','failed','unknown','averageMs','totalMs','fundingHash','rpcFailureCount','transactionResubmissions']}),flush=True)
    cooldown=client.post(base+'/api/bots',json={'code':code,'count':100})
    evidence['cooldown']={'status':cooldown.status_code,'body':cooldown.json()}
    assert cooldown.status_code==503 and '10' in cooldown.json()['error']
    published=client.get(base+'/api/bots').json()
    evidence['durableReadback']=published['batch']['batchId']==batch['batchId']
    assert evidence['durableReadback']
    assert batch['successful']==100 and batch['unknown']==0 and batch['failed']==0
    save(ROOT/'evidence/server-demo-acceptance.json',evidence)
    print('SERVER_HTTP_ACCEPTANCE_PASS',flush=True)
try: run()
except Exception as e:
    print(safe_error(e)); raise SystemExit(1)
