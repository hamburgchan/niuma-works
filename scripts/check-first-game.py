"""Read original testnet receipts; no sends or credential output."""
import json
from niuma import ROOT, chain, now, save

w3, contract = chain()
faucet = '0xe3008ca89c571a0893054bcc613e1ea3325b63e66f2ecc95ddf348ed923dc322'
run = '0x6cbbd280a7ed0926d78f79d972373ccfd99e89cb8f8aa05460059d5eae7b79a7'
records = []
for label, tx_hash in [('faucet', faucet), ('finishRun', run)]:
    tx = w3.eth.get_transaction(tx_hash)
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    assert receipt.status == 1
    row = dict(kind=label, hash=tx_hash, status='CONFIRMED', sender=tx['from'], to=tx['to'], nonce=tx['nonce'], valueWei=str(tx['value']), gasLimit=tx['gas'], gasUsed=receipt.gasUsed, chargedGasWei=str(tx['gas'] * receipt.effectiveGasPrice), blockNumber=receipt.blockNumber)
    if label == 'finishRun':
        events = contract.events.RunFinished().process_receipt(receipt)
        assert len(events) == 1
        row['event'] = dict(events[0]['args'])
        row['browserObservedConfirmationMs'] = 2569
        row['timingSource'] = 'Observed local browser UI; submit request to successful receipt, not a chain finality measurement'
    records.append(row)
report = dict(at=now(), chainId=10143, transactions=records, duplicateFaucetCheck='Same browser address returned original hash; UI showed 0.03 MON received, no second transfer')
save(ROOT / 'evidence/game-first-run.json', report)
print(json.dumps(report))
