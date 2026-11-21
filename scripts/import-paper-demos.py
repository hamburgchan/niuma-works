"""Fulfill the three authorized post-start transparent PNG demo commissions."""
import hashlib
import json
import shutil
import time
import httpx
from vercel.blob.sync import head_blob, put_blob
from vercel.blob.errors import BlobNotFoundError
from web3.logs import DISCARD
from niuma import ROOT, RUNTIME, blob_path, chain, now, prompt_hash, publish_progress, safe_error, save, send
from paper_assets import validate

DEMO = [("mule", "骡子新员工", "a mule office worker in blue overalls"),
        ("alpaca", "羊驼实习生", "a fluffy alpaca intern holding a coffee cup"),
        ("programmer", "加班程序员", "a tired programmer with dark eye circles holding a thermos")]


def main():
    w3, contract = chain()
    manifest = []
    for slug, name, prompt in DEMO:
        asset = RUNTIME / "paper-previews" / f"{slug}.png"
        info = validate(asset)
        marker = RUNTIME / f"paper-demo-{slug}.json"
        record = json.loads(marker.read_text(encoding="utf-8")) if marker.exists() else dict(
            displayName=name, prompt=prompt, source="NIUMA WORKS 团队自拟", generationSource="chatgpt 手动生成",
            mode="uploaded", createdAt=now(), **info)
        if record["sha256"] != info["sha256"]: raise ValueError("Processed asset changed after import started")
        if not record.get("orderId"):
            tx, receipt = send(w3, contract.functions.order(prompt_hash(prompt), int(time.time()) + 4 * 3600), "BUYER", f"paper-{slug}-order", value=contract.functions.characterPrice().call())
            record.update(orderId=contract.events.Ordered().process_receipt(receipt, errors=DISCARD)[0]["args"]["orderId"], orderTransaction=tx)
            save(marker, record)
        oid = record["orderId"]
        status = contract.functions.orders(oid).call()[3]
        if status == 0:
            if not record.get("url"):
                pathname = blob_path(oid, f"chatgpt-manual/{info['sha256']}.png")
                try:
                    uploaded = head_blob(pathname)
                except BlobNotFoundError:
                    uploaded = put_blob(pathname, asset.read_bytes(), access="public", content_type="image/png", allow_overwrite=False)
                record.update(url=uploaded.url, blobAccess="public")
                save(marker, record)
            # This GET has NO token, Cookie or Authorization header.
            response = httpx.get(record["url"], timeout=40)
            response.raise_for_status()
            if hashlib.sha256(response.content).hexdigest() != info["sha256"]: raise ValueError("Unauthenticated public download hash mismatch")
            record.update(publicDownloadVerified=True, downloadedSha256=info["sha256"], publicDownloadBytes=len(response.content))
            tx, receipt = send(w3, contract.functions.deliver(oid, bytes.fromhex(info["sha256"]), record["url"]), "OPERATOR", f"paper-{slug}-deliver")
            record.update(deliverTransaction=tx, characterId=contract.events.Delivered().process_receipt(receipt, errors=DISCARD)[0]["args"]["characterId"], status="delivered")
            save(marker, record)
        else:
            record["characterId"] = contract.functions.orders(oid).call()[4]
        if contract.functions.orders(oid).call()[3] == 1:
            tx, receipt = send(w3, contract.functions.approve(oid), "BUYER", f"paper-{slug}-approve")
            paid = contract.events.Paid().process_receipt(receipt, errors=DISCARD)[0]["args"]
            record.update(approveTransaction=tx, recipients=list(paid["recipients"]), splitAmountsWei=[str(x) for x in paid["amounts"]])
            save(marker, record)
        character = contract.functions.characters(record["characterId"]).call()
        if bytes(character[1]).hex() != info["sha256"] or character[2] != record["url"] or contract.functions.orders(oid).call()[3] != 2:
            raise ValueError("On-chain delivery or Paid readback mismatch")
        record.update(status="paid", onchainSha256=bytes(character[1]).hex(), verifiedAt=now())
        record["progressUrl"] = publish_progress(record)
        save(marker, record)
        save(ROOT / "evidence/orders" / f"{oid}.json", record)
        destination = ROOT / "packages/nextjs/public/employees" / f"{slug}.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset, destination)
        manifest.append(dict(id=record["characterId"], orderId=oid, name=name, slug=slug, url=record["url"], sha256=info["sha256"],
                             source=record["source"], generationSource=record["generationSource"], assetType="png", bytes=info["bytes"],
                             approveHash=record["approveTransaction"]["hash"]))
        print(json.dumps(manifest[-1], ensure_ascii=False), flush=True)
    save(ROOT / "packages/nextjs/contracts/demoCharacters.json", manifest)
    save(ROOT / "evidence/paper-background-processing.json", json.loads((RUNTIME / "paper-previews/processing.json").read_text(encoding="utf-8")))


if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(json.dumps({"error": safe_error(error)}, ensure_ascii=False), flush=True)
        raise SystemExit(1)
