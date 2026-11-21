"""Fresh public download, receipt/event readback, and reproducible order evidence."""
import hashlib
import json
from pathlib import Path
import httpx
from web3.logs import DISCARD
from niuma import ROOT, RUNTIME, chain, now, save

w3, contract = chain()
rows = []
checks = []
lines = ["# Real post-start character orders", "", f"Read back at {now()}, Monad testnet 10143.", "", "All descriptions: **NIUMA WORKS 团队自拟**. All models were freshly generated after the competition started. No pre-start script, image or sample GLB was copied into this repository.", "", "| orderId / characterId | Description | order | deliver | approve |", "|---|---|---|---|---|"]
for index in (1, 2, 3):
    demo = json.loads((RUNTIME / f"demo-{index}.json").read_text(encoding="utf-8"))
    order_id = demo["orderId"]
    file = ROOT / "evidence/orders" / f"{order_id}.json"
    record = json.loads(file.read_text(encoding="utf-8"))
    order = contract.functions.orders(order_id).call()
    character = contract.functions.characters(order[4]).call()
    assert order[3] == 2 and record["source"] == "NIUMA WORKS 团队自拟"
    url = record.get("publicUrl", record["url"])
    response = httpx.get(url, timeout=90)  # Intentionally no Authorization/cookies.
    response.raise_for_status()
    digest = hashlib.sha256(response.content).hexdigest()
    assert digest == record["sha256"] == bytes(character[1]).hex()
    (RUNTIME / "orders" / str(order_id) / "final-public-download.glb").write_bytes(response.content)
    events = []
    for label in ("orderTransaction", "deliverTransaction", "approveTransaction"):
        tx = record[label]
        receipt = w3.eth.get_transaction_receipt(tx["hash"])
        assert receipt["status"] == 1
        events.append(tx["hash"])
    receipt = w3.eth.get_transaction_receipt(events[2])
    paid = contract.events.Paid().process_receipt(receipt, errors=DISCARD)[0]["args"]
    assert list(paid["amounts"]) == [5000000000000000, 2000000000000000, 2000000000000000, 1000000000000000]
    record.update(finalPublicDownload={"at": now(), "unauthenticated": True, "bytes": len(response.content), "sha256": digest, "onchainMatch": True}, paidEvent={"recipients": list(paid["recipients"]), "amountsWei": [str(v) for v in paid["amounts"]]})
    save(file, record)
    links = [f"[{name}](https://testnet.monadexplorer.com/tx/{hash})" for name, hash in zip(["order", "deliver", "approve"], events)]
    lines.append(f"| {order_id} / {order[4]} | {record['prompt']} | {' | '.join(links)} |")
    checks.append({"orderId": order_id, "characterId": order[4], "status": "Paid", "publicUrl": url, "sha256": digest, "bytes": len(response.content), "transactions": events, "splitWei": record["paidEvent"]["amountsWei"]})
    rows.append(record)
lines += ["", "| orderId | GLB SHA-256 (public re-download = chain) | Bytes | FLUX / TRELLIS seconds |", "|---|---|---|---|"]
for record in rows:
    lines.append(f"| {record['orderId']} | `{record['sha256']}` | {record['bytes']} | {record['fluxSeconds']} / {record['trellisSeconds']} |")
lines += ["", "Each Paid event carries 0.005 / 0.002 / 0.002 / 0.001 MON. As explicitly requested, all four recipients are currently the deployer; three orders credit its withdrawable balance by 0.03 MON total. These are balances, not four external transfer transactions.", "", "Order 1's original on-chain URI points to the old private store. Its public mirror contains exactly the same bytes/SHA-256. Orders 2 and 3 directly register the new public store URLs. The application asset route resolves order 1 via its matching mirror; the chain history is unchanged.", "", "Timings include each Space call, queue/network and downloads (TRELLIS includes preprocessing). They are observed runs, not an SLA. Models have no skeletal animation; procedural game motion belongs to the later game stage."]
(ROOT / "evidence/orders.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
save(ROOT / "evidence/order-readback.json", {"at": now(), "status": "PASS", "orders": checks, "withdrawableDeployerWei": str(contract.functions.balances(w3.to_checksum_address(rows[0]["paidEvent"]["recipients"][0])) .call())})
print(json.dumps(checks, ensure_ascii=False, indent=2))
