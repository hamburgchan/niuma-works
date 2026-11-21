"""Read original funding and finishRun transactions; never send or retry."""
import json
from concurrent.futures import ThreadPoolExecutor
from web3.logs import DISCARD
from niuma import ROOT, chain, now, save
w3, contract = chain()
batches = [json.loads(path.read_text(encoding="utf-8")) for path in (ROOT / "evidence/bots").glob("*.json")]
batches = [batch for batch in batches if batch.get("phase") == "complete"]
rows = [(batch["batchId"], row) for batch in batches for row in batch["rows"]]
assert len({row["address"].lower() for _, row in rows}) == len(rows)
owner = contract.functions.owner().call()
def verify(entry):
    batch_id, row = entry
    funding = w3.eth.get_transaction(row["fundingHash"])
    funded = w3.eth.get_transaction_receipt(row["fundingHash"])
    assert funded.status == 1
    assert funding["from"].lower() == owner.lower() and funding["to"].lower() == row["address"].lower()
    assert funding["value"] == 12 * 10**15 and funding["gas"] == 21000
    if not row.get("hash"):
        assert row["state"] == "FAILED" and w3.eth.get_transaction_count(row["address"]) == 0
        return dict(batchId=batch_id, fundingHash=row["fundingHash"], address=row["address"], fundingStatus=True,
                    finishRunBroadcast=False, reason=row["reason"], remainingBalanceWei=str(w3.eth.get_balance(row["address"])))
    tx = w3.eth.get_transaction(row["hash"])
    receipt = w3.eth.get_transaction_receipt(row["hash"])
    assert receipt.status == 1
    assert tx["from"].lower() == row["address"].lower() and tx["to"].lower() == contract.address.lower()
    assert tx["nonce"] == 0 and tx["gas"] == int(row["gasLimit"])
    event = contract.events.RunFinished().process_receipt(receipt, errors=DISCARD)[0]["args"]
    assert event["characterId"] == row["characterId"] and event["stars"] == row["stars"] and event["timeMs"] == row["timeMs"]
    assert event["player"].lower() == row["address"].lower()
    return dict(batchId=batch_id, hash=row["hash"], fundingHash=row["fundingHash"], address=row["address"], characterId=row["characterId"],
                status=True, blockNumber=receipt.blockNumber, chargedFeeWei=str(tx["gas"] * receipt.effectiveGasPrice), ownerShareWei=str(event["ownerShare"]))
with ThreadPoolExecutor(max_workers=4) as pool: verified = list(pool.map(verify, rows))
report = dict(at=now(), chainId=10143, status="PASS_RECEIPT_AUDIT_WITH_PRESERVED_BATCH_FAILURE", batchCount=len(batches), fundingReceiptCount=len(verified), finishRunReceiptCount=sum('hash' in row for row in verified),
              confirmationTimingScope="Measured by robot process; not chain finality or load capacity evidence", rows=verified)
save(ROOT / "evidence/bots/receipt-verification.json", report)
print(json.dumps({k:v for k,v in report.items() if k != "rows"}))
