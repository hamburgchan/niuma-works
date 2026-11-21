"""Publish a hash-identical mirror; never modify the original immutable on-chain URI."""
import argparse
import json
from pathlib import Path
import httpx
from vercel.blob.sync import put_blob
from niuma import ROOT, RUNTIME, blob_path, chain, now, publish_progress, safe_error, save, validate_glb

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("order_id", type=int)
    args = parser.parse_args()
    try:
        path = RUNTIME / "orders" / str(args.order_id) / "job.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        info = validate_glb(record["glbPath"])
        _, contract = chain()
        character = contract.functions.characters(record["characterId"]).call()
        if info["sha256"] != bytes(character[1]).hex():
            raise ValueError("Mirror does not match the on-chain SHA-256")
        if not record.get("publicUrl"):
            uploaded = put_blob(blob_path(args.order_id, info["sha256"] + ".glb"), Path(record["glbPath"]).read_bytes(), access="public", content_type="model/gltf-binary", allow_overwrite=False)
            record.update(publicUrl=uploaded.url, publicMirrorPublishedAt=now(), originalOnchainUri=character[2])
            save(path, record)
        response = httpx.get(record["publicUrl"], timeout=90)
        response.raise_for_status()
        download = path.parent / "public-download.glb"
        download.write_bytes(response.content)
        if validate_glb(download)["sha256"] != info["sha256"]:
            raise ValueError("Public mirror download hash mismatch")
        record["publicDownloadedSha256"] = info["sha256"]
        publish_progress(record)
        save(path, record)
        evidence_path = ROOT / "evidence/orders" / f"{args.order_id}.json"
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        evidence.update({key: record[key] for key in ["publicUrl", "publicMirrorPublishedAt", "originalOnchainUri", "publicDownloadedSha256"]})
        save(evidence_path, evidence)
        print(json.dumps({"publicMirror": record["publicUrl"], "sha256": info["sha256"], "unauthenticatedDownload": "PASS", "onchainUriUnchanged": True}))
    except Exception as error:
        print(json.dumps({"error": safe_error(error)}))
        raise SystemExit(1)
