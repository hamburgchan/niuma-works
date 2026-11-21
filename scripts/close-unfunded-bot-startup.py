"""Close only the known pre-funding startup failure, preserving its evidence."""
import json
from vercel.blob.sync import get_blob, head_blob, put_blob
from vercel.blob.errors import BlobNotFoundError
from niuma import ROOT, DEPLOYMENT, chain, now, save
w3, contract = chain()
root = f"niuma/{DEPLOYMENT['address'].lower()}"
batch_id = "f9bc8523-eb79-4ed2-979e-cf744f41ecb8"
path = f"{root}/bots/batches/{batch_id}.json"
batch = json.loads(get_blob(path, access="public").body)
ledger = json.loads(get_blob(f"{root}/faucet/ledger-v1.json", access="public").body)
assert not any(k.startswith(batch_id) for k in ledger.get("botFunding", {}))
for row in batch["rows"]:
    assert row["state"] == "CREATED" and not row.get("fundingHash")
    assert w3.eth.get_balance(row["address"]) == 0 and w3.eth.get_transaction_count(row["address"]) == 0
try:
    head_blob(f"{root}/bots/control.json")
    raise RuntimeError("Unexpected control record; refuse to change the batch")
except BlobNotFoundError: pass
for row in batch["rows"]:
    row.update(state="FAILED", reason="Pre-funding startup failed: absent control blob was checked by error.name rather than instanceof. No funding or finishRun broadcast; temporary keys discarded.")
batch.update(phase="blocked", failed=5, finishedAt=__import__('time').time_ns()//1000000, verifiedAt=now(), verifiedNoFunding=True)
batch["totalMs"] = batch["finishedAt"] - batch["startedAt"]
body = json.dumps(batch, ensure_ascii=False).encode()
result = put_blob(path, body, access="public", content_type="application/json", allow_overwrite=True)
put_blob(path + ".versions/" + result.etag.encode().hex() + ".json", body, access="public", content_type="application/json", allow_overwrite=False)
save(ROOT / "evidence/bots" / f"{batch_id}-startup-failed.json", batch)
print("Verified and preserved: five CREATED wallets, zero balances/nonces, no funding reservation, no control record, zero financial broadcasts.")
