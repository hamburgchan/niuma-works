"""Create and fulfill only the three team-authored, explicitly authorized demo orders."""
import argparse
import json
import time

from generate import work
from niuma import ROOT, RUNTIME, chain, now, prompt_hash, safe_error, save, send

PROMPTS = [
    ("一个戴着黄色安全帽、扛着扳手的胖土豆工人", "A chubby potato worker wearing a yellow hard hat, carrying a wrench"),
    ("一只穿着宇航服、表情呆滞的柴犬", "A Shiba Inu dog in an astronaut spacesuit, with a blank vacant expression"),
    ("一个背着书包、头顶冒热气的小包子", "A small steamed bun character carrying a school backpack, steam rising from the top of its head"),
]


def demo(index, fund_only=False):
    prompt, english = PROMPTS[index - 1]
    w3, contract = chain()
    path = RUNTIME / f"demo-{index}.json"
    record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"prompt": prompt, "source": "NIUMA WORKS 团队自拟", "createdAt": now()}
    if not record.get("orderId"):
        tx, receipt = send(w3, contract.functions.order(prompt_hash(prompt), int(time.time()) + 4 * 3600), "BUYER", f"demo-{index}-order", value=contract.functions.characterPrice().call())
        event = contract.events.Ordered().process_receipt(receipt)[0]
        record.update(orderId=event["args"]["orderId"], orderTransaction=tx)
        save(path, record)
    status = ["funded", "delivered", "paid", "refunded"][contract.functions.orders(record["orderId"]).call()[3]]
    print(json.dumps({"orderId": record["orderId"], "status": status, "prompt": prompt}, ensure_ascii=False), flush=True)
    if fund_only:
        return
    result = work(record["orderId"], prompt, english, source=record["source"], approve=True, seed=42 + index)
    result["orderTransaction"] = record["orderTransaction"]
    save(ROOT / "evidence/orders" / f"{record['orderId']}.json", result)
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=int, choices=[1, 2, 3])
    parser.add_argument("--fund-only", action="store_true")
    args = parser.parse_args()
    try:
        demo(args.index, args.fund_only)
    except Exception as error:
        print(json.dumps({"error": safe_error(error)}, ensure_ascii=False), flush=True)
        raise SystemExit(1)
