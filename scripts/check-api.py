"""Exercise the real local order API; does not create orders or call a model."""
import argparse
import json
import os
import httpx
from eth_account.messages import encode_defunct
from niuma import DEPLOYMENT, ROOT, RUNTIME, chain, now, prompt_hash, safe_error, save


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=int)
    parser.add_argument("--base", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    report = {"at": now(), "checks": []}
    try:
        demo = json.loads((RUNTIME / f"demo-{args.index}.json").read_text(encoding="utf-8"))
        order_id, prompt = demo["orderId"], demo["prompt"]
        w3, _ = chain()
        hash_hex = "0x" + bytes(prompt_hash(prompt)).hex()
        message = f"NIUMA WORKS start\nchainId: 10143\ncontract: {DEPLOYMENT['address']}\norderId: {order_id}\npromptHash: {hash_hex}"
        def signature(role):
            return "0x" + bytes(w3.eth.account.sign_message(encode_defunct(text=message), private_key=os.environ[role + "_PRIVATE_KEY"]).signature).hex()
        url = f"{args.base}/api/orders/{order_id}/start"
        with httpx.Client(timeout=180) as client:
            bad_prompt = client.post(url, json={"prompt": prompt + "错误", "signature": signature("BUYER")})
            assert bad_prompt.status_code == 400 and "prompt" in bad_prompt.json()["error"], bad_prompt.text
            report["checks"].append({"name": "reject-mismatched-prompt", "status": "PASS", "http": bad_prompt.status_code})
            bad_buyer = client.post(url, json={"prompt": prompt, "signature": signature("OPERATOR")})
            assert bad_buyer.status_code == 400 and "signature" in bad_buyer.json()["error"], bad_buyer.text
            report["checks"].append({"name": "reject-nonbuyer-signature", "status": "PASS", "http": bad_buyer.status_code})
            payload = {"prompt": prompt, "signature": signature("BUYER")}
            first = client.post(url, json=payload)
            assert first.status_code in (200, 202), first.text
            second = client.post(url, json=payload)
            assert second.status_code == 200 and second.json().get("existing") is True, second.text
            report["checks"].append({"name": "signed-start-and-repeat-is-existing", "status": "PASS", "firstHttp": first.status_code, "secondHttp": second.status_code})
            progress = client.get(f"{args.base}/api/orders/{order_id}")
            assert progress.status_code == 200, progress.text
            report["checks"].append({"name": "read-real-order-progress", "status": "PASS", "chainStatus": progress.json()["chainStatus"], "worker": progress.json()["worker"]})
        report.update(status="PASS", orderId=order_id, gpuCallsByApi=0, scope="Real HTTP, chain reads and Blob queue. GPU generation and operator delivery run in the separate local worker.")
        save(ROOT / "evidence/api-check.json", report)
        print(json.dumps(report, ensure_ascii=False), flush=True)
    except Exception as error:
        report.update(status="FAIL", error=safe_error(error))
        save(ROOT / "evidence/api-check.json", report)
        print(json.dumps(report, ensure_ascii=False), flush=True)
        raise SystemExit(1)
