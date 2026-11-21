"""Run locally while demonstrating: immutable Blob queue -> generation -> operator delivery."""
import argparse
import json
import time
from vercel.blob.sync import get_blob, query_blobs
from generate import work
from niuma import BLOB_ACCESS, DEPLOYMENT, RUNTIME, safe_error


def tick():
    prefix = f"niuma/{DEPLOYMENT['address'].lower()}/orders/"
    for blob in query_blobs(prefix=prefix):
        if not blob.pathname.endswith("/request.json"):
            continue
        request = json.loads(get_blob(blob.url, access=BLOB_ACCESS).body)
        order_id = int(request["orderId"])
        path = RUNTIME / "orders" / str(order_id) / "job.json"
        if path.exists():
            existing = json.loads(path.read_text(encoding="utf-8"))
            if existing.get("status") in {"paid", "delivered", "needs-reconciliation", "generation-failed", "refunded-withdrawable"}:
                continue
        result = work(order_id, request["prompt"], source=request.get("source", "用户委托"))
        print(json.dumps({"orderId": order_id, "status": result["status"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    while True:
        try:
            tick()
        except Exception as error:
            print(json.dumps({"error": safe_error(error)}, ensure_ascii=False), flush=True)
            if not args.watch:
                raise SystemExit(1)
        if not args.watch:
            break
        time.sleep(10)
