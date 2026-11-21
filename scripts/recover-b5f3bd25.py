"""Recover only the funded production batch's original hashes. Never fund wallets."""
import hashlib, hmac, json, os, time, zlib
import httpx
from web3 import Web3
from niuma import ROOT, RUNTIME, chain, now, save, send, safe_error

BATCH = '0xb5f3bd25bda080de3a3cee5bb921a68bc7530bbc6e3b77a03b5bb31e1d8acdf8'
FUNDING = '0x62294785be804149ddbca4295f10ce1aa3db3de566e6a0d2e512b04fcea35098'
RPC = 'https://testnet-rpc.monad.xyz'
report = {'batchId': BATCH, 'fundingHash': FUNDING, 'startedAt': now(), 'newWallets': 0, 'newFundingWei': '0', 'scope': 'Recovery only; original nonce-0 signed hashes. Historical first-send timing and RPC errors are unknown.'}
target = ROOT / 'evidence/server-production-recovery-b5f3bd25.json'

def rpc_batch(requests):
    for attempt in range(4):
        try:
            response = httpx.post(RPC, json=requests, timeout=30)
            response.raise_for_status()
            return {row['id']: row for row in response.json()}
        except (httpx.HTTPError, ValueError):
            if attempt == 3: raise RuntimeError('RPC recovery read/broadcast failed') from None
            time.sleep(2 ** attempt)

try:
    w, _ = chain()
    config = json.loads((ROOT / 'packages/nextjs/contracts/demoBank.json').read_text())
    bank = w.eth.contract(address=config['address'], abi=config['abi'])
    bid = bytes.fromhex(BATCH[2:])
    assert bytes(bank.functions.latestBatch().call()) == bid, 'Different latest batch; stop'
    record = bank.functions.batch(bid).call()
    if record[3]:
        print('Original batch already complete; no transaction sent')
        raise SystemExit(0)
    plan = json.loads(zlib.decompress(record[2]))
    key = bytes.fromhex(os.environ['DEPLOYER_PRIVATE_KEY'].removeprefix('0x'))
    owner = w.eth.account.from_key(key)
    assert owner.address.lower() == config['owner'].lower()
    report['deployerBalanceBeforeMON'] = str(w.from_wei(w.eth.get_balance(owner.address), 'ether'))
    print(json.dumps({'batchId': BATCH, 'deployerBalanceMON': report['deployerBalanceBeforeMON'], 'newWallets': 0, 'newFundingMON': 0}), flush=True)
    deployment = json.loads((ROOT / 'evidence/deployment-v2.json').read_text())
    artifact = json.loads((ROOT / 'packages/foundry/out/NiumaWorksV2.sol/NiumaWorksV2.json').read_text())
    game = w.eth.contract(address=Web3.to_checksum_address(deployment['address']), abi=artifact['abi'])
    prior = json.loads((ROOT / 'evidence/server-production-receipt-audit-b5f3bd25.json').read_text())
    rows, raw = [], []
    for i in range(plan['count']):
        domain = f"NIUMA-DEMO-BOT-V1|10143|{config['address'].lower()}|{BATCH}|{i}"
        account = w.eth.account.from_key(hmac.new(key, domain.encode(), hashlib.sha256).digest())
        random = w.keccak(text=f'{BATCH}:{i}')
        stars, duration = 3 + random[0] % 4, 15000 + ((random[1] << 8) + random[2]) % 45001
        signed = account.sign_transaction(dict(chainId=10143, nonce=0, to=game.address, value=10**15, gas=int(plan['gasLimits'][i]), gasPrice=int(plan['gasPrice']), data=game.functions.finishRun(i % 3 + 1, stars, duration)._encode_transaction_data()))
        txhash = Web3.to_hex(signed.hash)
        assert txhash == prior['rows'][i]['hash'], 'Original hash mismatch; stop'
        rows.append({'index': i, 'address': account.address, 'characterId': i % 3 + 1, 'stars': stars, 'timeMs': duration, 'hash': txhash, 'fundingHash': FUNDING})
        raw.append(Web3.to_hex(signed.raw_transaction))
    receipts = {}
    def read_receipts():
        for offset in range(0, len(rows), 20):
            group = rows[offset:offset + 20]
            values = rpc_batch([{'jsonrpc': '2.0', 'id': r['index'], 'method': 'eth_getTransactionReceipt', 'params': [r['hash']]} for r in group])
            for r in group:
                if values[r['index']].get('result'): receipts[r['hash']] = values[r['index']]['result']
    read_receipts()
    missing = [r for r in rows if r['hash'] not in receipts]
    report['confirmedBeforeRecovery'] = len(receipts)
    report['originalHashesToRebroadcast'] = [r['hash'] for r in missing]
    save(target, report)
    save(RUNTIME / 'recovery-b5f3bd25.json', report)
    print(json.dumps({'confirmedBefore': len(receipts), 'originalHashesToRebroadcast': len(missing)}), flush=True)
    pending = missing
    for attempt in range(4):
        if not pending: break
        values = rpc_batch([{'jsonrpc': '2.0', 'id': r['index'], 'method': 'eth_sendRawTransaction', 'params': [raw[r['index']]]} for r in pending])
        retry = []
        for r in pending:
            value = values[r['index']]
            if 'result' in value:
                assert value['result'].lower() == r['hash'].lower()
            else:
                message = str(value.get('error', {})).lower()
                if not any(word in message for word in ['already known', 'nonce too low', 'known transaction']): retry.append(r)
        report.setdefault('broadcastAttempts', []).append({'attempt': attempt + 1, 'requested': len(pending), 'rpcRejected': len(retry)})
        save(target, report)
        pending = retry
        if pending: time.sleep(2 ** attempt)
    for _ in range(12):
        read_receipts()
        if len(receipts) == len(rows): break
        time.sleep(1)
    for r in rows:
        receipt = receipts.get(r['hash'])
        r['state'] = 'CONFIRMED' if receipt and receipt['status'] == '0x1' else 'FAILED' if receipt else 'UNKNOWN'
        if receipt: r['blockNumber'] = int(receipt['blockNumber'], 16)
    report.update(successful=sum(r['state'] == 'CONFIRMED' for r in rows), failed=sum(r['state'] == 'FAILED' for r in rows), unknown=sum(r['state'] == 'UNKNOWN' for r in rows), rows=rows)
    save(target, report)
    if report['unknown']: raise RuntimeError('Original batch still unknown; retain same hashes, no new funding')
    numbers = sorted(set(r['blockNumber'] for r in rows))
    headers = rpc_batch([{'jsonrpc': '2.0', 'id': n, 'method': 'eth_getBlockByNumber', 'params': [hex(n), False]} for n in numbers])
    blocks = [{'number': n, 'timestamp': int(headers[n]['result']['timestamp'], 16), 'count': sum(r['blockNumber'] == n for r in rows), 'hashes': [r['hash'] for r in rows if r['blockNumber'] == n]} for n in numbers]
    result = dict(batchId=BATCH, contract=game.address, count=len(rows), mode='server-spread-recovered', version='v2', phase='COMPLETE', rows=rows, sent=len(rows), successful=report['successful'], failed=report['failed'], unknown=0, averageMs=None, p95Ms=None, timingSamples=0, totalMs=int(time.time()*1000)-plan['createdAt'], maxSameBlock=max(b['count'] for b in blocks), blockCount=len(blocks), chainSpanSeconds=blocks[-1]['timestamp']-blocks[0]['timestamp'], blocks=blocks, chainFailureCount=report['failed'], transactionResubmissions=len(missing), fundingHash=FUNDING, timingNote='恢复原批次；首次广播时刻与原始RPC失败次数未保存，不补造计时；链上跨度包括恢复等待。', totalGasWei=str(sum(int(plan['gasLimits'][r['index']])*int(receipts[r['hash']]['effectiveGasPrice'],16) for r in rows)))
    tx, _ = send(w, bank.functions.finishBatch(bid, zlib.compress(json.dumps(result, separators=(',', ':')).encode())), 'DEPLOYER', 'finish-existing-b5f3bd25')
    report.update(finishedAt=now(), result=result, resultRegistration=tx, resultPersisted=True)
    save(target, report)
    print(json.dumps({k:report[k] for k in ['batchId','successful','failed','unknown','newWallets','newFundingWei','resultPersisted']}), flush=True)
except Exception as error:
    report['error'] = safe_error(error)
    save(target, report)
    print(safe_error(error))
    raise SystemExit(1)
