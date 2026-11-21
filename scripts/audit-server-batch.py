"""Read-only key-recovery audit: reproduce original hashes, never broadcast."""
import json, os, hmac, hashlib, zlib
from web3 import Web3
from niuma import ROOT, chain, save, now, safe_error
try:
    w3,_=chain()
    config=json.loads((ROOT/'packages/nextjs/contracts/demoBank.json').read_text())
    bank=w3.eth.contract(address=config['address'],abi=config['abi'])
    bid=bank.functions.latestBatch().call()
    record=bank.functions.batch(bid).call()
    plan=json.loads(zlib.decompress(record[2]))
    result=json.loads(zlib.decompress(record[3]))
    artifact=json.loads((ROOT/'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text())
    game=w3.eth.contract(address=Web3.to_checksum_address(result['contract']),abi=artifact['abi'])
    key=bytes.fromhex(os.environ['DEPLOYER_PRIVATE_KEY'].removeprefix('0x'))
    batch_id='0x'+bid.hex()
    verified=[]
    for row in result['rows']:
        i=row['index']
        domain=f"NIUMA-DEMO-BOT-V1|10143|{config['address'].lower()}|{batch_id}|{i}"
        account=w3.eth.account.from_key(hmac.new(key,domain.encode(),hashlib.sha256).digest())
        assert account.address.lower()==row['address'].lower()
        random=w3.keccak(text=f'{batch_id}:{i}')
        stars=3+random[0]%4; duration=15000+((random[1]<<8)+random[2])%45001
        data=game.functions.finishRun(i%3+1,stars,duration)._encode_transaction_data()
        signed=account.sign_transaction(dict(chainId=10143,nonce=0,to=game.address,value=10**15,gas=int(plan['gasLimits'][i]),gasPrice=int(plan['gasPrice']),data=data))
        assert signed.hash.hex().removeprefix('0x')==row['hash'].removeprefix('0x')
        verified.append(row['hash'])
    report=dict(at=now(),status='PASS',batchId=batch_id,verifiedOriginalHashes=len(verified),scope='Fresh process reconstructs each wallet and identical signed nonce-0 transaction from the on-chain plan. No new broadcast, keys stay in memory, no key output.',hashes=verified)
    save(ROOT/'evidence/server-batch-recovery-audit.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='hashes'}))
except Exception as e:
    print(safe_error(e));raise SystemExit(1)
