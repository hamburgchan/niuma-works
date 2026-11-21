"""User-authorized fresh foreground-corrected demo orders; preserves old evidence."""
import argparse
import json
import time
from demo import PROMPTS
from generate import work
from niuma import ROOT, RUNTIME, chain, now, prompt_hash, safe_error, save, send

parser=argparse.ArgumentParser()
parser.add_argument("index",type=int,choices=[1,2,3])
args=parser.parse_args()
try:
    prompt,english=PROMPTS[args.index-1]
    path=RUNTIME/f"foreground-demo-{args.index}.json"
    record=json.loads(path.read_text(encoding="utf-8")) if path.exists() else dict(prompt=prompt,source="NIUMA WORKS 团队自拟",supersedesCharacterId=[4,2,3][args.index-1],createdAt=now())
    w3,contract=chain()
    if not record.get("orderId"):
        tx,receipt=send(w3,contract.functions.order(prompt_hash(prompt),int(time.time())+4*3600),"BUYER",f"foreground-demo-{args.index}-order",value=contract.functions.characterPrice().call())
        record.update(orderId=contract.events.Ordered().process_receipt(receipt)[0]["args"]["orderId"],orderTransaction=tx)
        save(path,record)
    print(json.dumps({"index":args.index,"orderId":record["orderId"],"status":"funded"}),flush=True)
    result=work(record["orderId"],prompt,english,source=record["source"],approve=True,seed=42+args.index)
    result.update(orderTransaction=record["orderTransaction"],supersedesCharacterId=record["supersedesCharacterId"])
    save(ROOT/"evidence/orders"/f"{record['orderId']}.json",result)
    print(json.dumps(result,ensure_ascii=False),flush=True)
except Exception as error:
    print(json.dumps({"error":safe_error(error)},ensure_ascii=False),flush=True)
    raise SystemExit(1)
