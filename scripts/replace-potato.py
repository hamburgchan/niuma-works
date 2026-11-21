"""New public-URI order for the already generated, post-start potato GLB."""
import json
import time
from pathlib import Path
import httpx
from vercel.blob.sync import put_blob
from niuma import ROOT, RUNTIME, blob_path, chain, now, prompt_hash, publish_progress, safe_error, save, send, validate_glb

try:
    # A new order snapshots recipients, so the user-requested update must happen first.
    if not (ROOT / "evidence/recipients-update.json").exists():
        raise RuntimeError("Update the four user-provided recipients before funding replacement order 4")
    original = json.loads((ROOT / "evidence/orders/1.json").read_text(encoding="utf-8"))
    asset = RUNTIME / "orders/1/character.glb"
    info = validate_glb(asset)
    assert info["sha256"] == original["sha256"]
    w3, contract = chain()
    path = RUNTIME / "potato-replacement.json"
    record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"prompt": original["prompt"], "source": "NIUMA WORKS 团队自拟", "assetProvenance": "Same post-start FLUX/TRELLIS generation as order 1; re-registered with a public URI, not regenerated", "replacesOrder": 1, "mode": "re-registered", "createdAt": now(), **info}
    if not record.get("orderId"):
        if contract.functions.orderCount().call() != 3:
            raise RuntimeError("Expected next order ID 4; reconcile current order count first")
        tx, receipt = send(w3, contract.functions.order(prompt_hash(record["prompt"]), int(time.time()) + 4 * 3600), "BUYER", "potato-replacement-order", value=contract.functions.characterPrice().call())
        record.update(orderId=contract.events.Ordered().process_receipt(receipt)[0]["args"]["orderId"], orderTransaction=tx)
        save(path, record)
    if not record.get("url"):
        blob = put_blob(blob_path(record["orderId"], record["sha256"] + ".glb"), asset.read_bytes(), access="public", content_type="model/gltf-binary", allow_overwrite=False)
        record.update(url=blob.url, blobAccess="public")
        save(path, record)
    response = httpx.get(record["url"], timeout=90)
    response.raise_for_status()
    destination = RUNTIME / "orders" / str(record["orderId"]) / "downloaded.glb"
    destination.parent.mkdir(exist_ok=True, parents=True)
    destination.write_bytes(response.content)
    assert validate_glb(destination)["sha256"] == record["sha256"]
    record["downloadedSha256"] = record["sha256"]
    if not record.get("deliverTransaction"):
        tx, receipt = send(w3, contract.functions.deliver(record["orderId"], bytes.fromhex(record["sha256"]), record["url"]), "OPERATOR", "potato-replacement-deliver")
        record.update(deliverTransaction=tx, characterId=contract.events.Delivered().process_receipt(receipt)[0]["args"]["characterId"])
        save(path, record)
    if not record.get("approveTransaction"):
        tx, _ = send(w3, contract.functions.approve(record["orderId"]), "BUYER", "potato-replacement-approve")
        record["approveTransaction"] = tx
    order = contract.functions.orders(record["orderId"]).call()
    character = contract.functions.characters(record["characterId"]).call()
    assert order[3] == 2 and character[2] == record["url"] and bytes(character[1]).hex() == record["sha256"]
    record.update(status="paid", onchainSha256=record["sha256"], unauthenticatedDownload="PASS", verifiedAt=now())
    publish_progress(record)
    save(path, record)
    save(ROOT / "evidence/orders" / f"{record['orderId']}.json", record)
    print(json.dumps(record, ensure_ascii=False, indent=2))
except Exception as error:
    print(json.dumps({"error": safe_error(error)}, ensure_ascii=False))
    raise SystemExit(1)
