"""Owner-signed local control for the same robot-employer engine as /live."""
import argparse
import json
import os
import time
import uuid
import httpx
from eth_account.messages import encode_defunct
from niuma import ROOT, RUNTIME, DEPLOYMENT, chain, safe_error, save

parser = argparse.ArgumentParser()
parser.add_argument("--n", type=int, default=30, choices=range(1, 31))
parser.add_argument("--url", default="http://127.0.0.1:3000")
parser.add_argument("--read", help="Only read the original batch; never resend")
parser.add_argument("--batch-id", help="Original unstarted batch ID after verified pre-execution compilation failure")
args = parser.parse_args()
try:
    if args.read:
        response = httpx.get(f"{args.url}/api/bots", params={"id": args.read}, timeout=90)
    else:
        w3, contract = chain()
        account = w3.eth.account.from_key(os.environ["DEPLOYER_PRIVATE_KEY"])
        if account.address.lower() != contract.functions.owner().call().lower(): raise ValueError("Configured deployer is not the owner")
        batch_id, issued = args.batch_id or str(uuid.uuid4()), int(time.time() * 1000)
        message = f"NIUMA WORKS bot rush\nchainId: 10143\ncontract: {DEPLOYMENT['address']}\ncount: {args.n}\nbatchId: {batch_id}\nissuedAt: {issued}"
        signature = w3.to_hex(account.sign_message(encode_defunct(text=message)).signature)
        save(RUNTIME / "bot-rush-last.json", dict(batchId=batch_id, count=args.n, url=args.url, state="REQUESTING"))
        print(json.dumps(dict(batchId=batch_id, count=args.n, state="REQUESTING")), flush=True)
        response = httpx.post(f"{args.url}/api/bots", json=dict(batchId=batch_id, count=args.n, issuedAt=issued, signature=signature), timeout=360)
    if not response.is_success:
        try: detail = response.json().get("error", f"HTTP {response.status_code}")
        except ValueError: detail = f"HTTP {response.status_code} before JSON response"
        raise ValueError(detail)
    result = response.json()
    batch = result.get("batch")
    if not batch: raise ValueError(result.get("error", "No batch returned"))
    save(ROOT / "evidence/bots" / f"{batch['batchId']}.json", batch)
    print(json.dumps(batch, ensure_ascii=False), flush=True)
except Exception as error:
    print(json.dumps({"error": safe_error(error), "recovery": "Use --read with the original batchId. Never rerun a failed or unknown payment."}, ensure_ascii=False), flush=True)
    raise SystemExit(1)
