"""Deploy V2 once, keeping original pre-broadcast evidence and V1 records."""
import json, os
from niuma import ROOT, chain, send, save, safe_error, now
from eth_abi import encode
try:
    w3, old=chain()
    p=ROOT/'evidence/deployment-v2.json'
    if p.exists(): raise ValueError('V2 deployment already exists; no redeployment')
    artifact=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text())
    owner=w3.eth.account.from_key(os.environ['DEPLOYER_PRIVATE_KEY']).address
    operator=old.functions.operator().call(); treasury=old.functions.treasury().call()
    payouts=[old.functions.payouts(i).call() for i in range(3)]
    factory=w3.eth.contract(abi=artifact['abi'],bytecode=artifact['bytecode']['object'])
    args=[owner,operator,treasury,payouts]
    tx,receipt=send(w3,factory.constructor(*args),'DEPLOYER','deploy-v2')
    address=receipt['contractAddress']
    if not w3.eth.get_code(address): raise ValueError('No runtime bytecode')
    save(p,dict(chainId=10143,contract='contracts/NiumaWorksV2.sol:NiumaWorksV2',address=address,transactionHash=tx['hash'],blockNumberHex=hex(receipt['blockNumber']),sender=owner,operator=operator,treasury=treasury,payouts=payouts,constructorArgs=encode(['address','address','address','address[3]'],args).hex(),verification='PENDING',createdAt=now(),transaction=tx))
    print(json.dumps({'address':address,'hash':tx['hash'],'state':'DEPLOYED'}))
except Exception as e:
    print(safe_error(e)); raise SystemExit(1)
