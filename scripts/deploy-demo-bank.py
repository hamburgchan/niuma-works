"""Deploy the independent demonstration ledger once, without changing V2."""
import json, os
from niuma import ROOT, chain, send, save, now, safe_error
try:
    w3, _ = chain()
    target = ROOT / 'evidence/demo-bank-deployment.json'
    if target.exists(): raise ValueError('Demo ledger already deployed; read existing evidence')
    artifact = json.loads((ROOT/'packages/foundry/out/NiumaDemoBank.sol/NiumaDemoBank.json').read_text())
    signer = w3.eth.account.from_key(os.environ['DEPLOYER_PRIVATE_KEY']).address
    print(json.dumps({'deployer':signer, 'balanceMON':str(w3.from_wei(w3.eth.get_balance(signer),'ether'))}))
    factory = w3.eth.contract(abi=artifact['abi'], bytecode=artifact['bytecode']['object'])
    tx, receipt = send(w3, factory.constructor(signer), 'DEPLOYER', 'deploy-demo-bank')
    record = dict(address=receipt['contractAddress'], chainId=10143, deployedOnBlock=receipt['blockNumber'], hash=tx['hash'], owner=signer, createdAt=now())
    save(target, record)
    save(ROOT/'packages/nextjs/contracts/demoBank.json', {**record, 'abi':artifact['abi']})
    print(json.dumps(record))
except Exception as e:
    print(safe_error(e)); raise SystemExit(1)
