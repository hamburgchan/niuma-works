"""Fresh post-start FLUX -> TRELLIS worker. An existing job is never resubmitted."""
import argparse
import json
import os
import shutil
import time
from pathlib import Path

from gradio_client import Client, handle_file
from niuma import BLOB_ACCESS, ROOT, RUNTIME, blob_path, chain, now, prompt_hash, publish_progress, safe_error, save, send, validate_glb

FLUX = "black-forest-labs/FLUX.1-schnell"
TRELLIS = "trellis-community/TRELLIS"
SUFFIX = ", single character, full body, front view, plain white background, stylized game character, isolated, no text"


def generate(record, folder, path):
    if record.get("glbPath"):
        validate_glb(record["glbPath"])
        return
    if record.get("gpuAttemptStarted"):
        raise RuntimeError("An earlier GPU attempt exists; reconcile its result instead of submitting twice")
    token = os.environ.get("HF_TOKEN")
    if not token or not token.startswith("hf_"):
        raise RuntimeError("HF_TOKEN missing")
    if record.get("mode") == "uploaded":
        raise RuntimeError("Upload mode requires a GLB file")
    common = dict(token=token, verbose=False, analytics_enabled=False, download_files=str(folder / "downloads"), httpx_kwargs={"timeout": 60})
    flux = Client(FLUX, **common)
    trellis = Client(TRELLIS, **common)
    save(folder / "flux-api.json", flux.view_api(print_info=False, return_format="dict"))
    save(folder / "trellis-api.json", trellis.view_api(print_info=False, return_format="dict"))
    record.update(status="generating-image", spaces=[FLUX, TRELLIS])
    save(path, record)
    publish_progress(record)
    from vercel.blob.sync import put_blob
    # Blob's create-only object prevents another machine from starting the same GPU job.
    put_blob(blob_path(record["orderId"], "gpu-claim.json"), json.dumps({"orderId": record["orderId"], "startedAt": now(), "seed": record["seed"]}).encode(), access=BLOB_ACCESS, content_type="application/json", allow_overwrite=False)
    record["gpuAttemptStarted"] = now()
    save(path, record)
    started = time.perf_counter()
    job = flux.submit(prompt=record["generationPrompt"], seed=record["seed"], randomize_seed=False, width=512, height=512, num_inference_steps=4, api_name="/infer")
    record["fluxEventId"] = getattr(job, "event_id", None)
    save(path, record)
    image_result = job.result()
    image = image_result[0]
    if isinstance(image, dict):
        image = image.get("path") or image.get("image")
    image = str(image)
    record.update(imagePath=image, fluxSeconds=round(time.perf_counter() - started, 3), status="generating-3d")
    save(path, record)
    publish_progress(record)
    started = time.perf_counter()
    trellis.predict(api_name="/start_session")
    image = trellis.predict(image=handle_file(image), api_name="/preprocess_image")
    job = trellis.submit(image=handle_file(image), multiimages=[], seed=record["seed"], ss_guidance_strength=7.5, ss_sampling_steps=12, slat_guidance_strength=3, slat_sampling_steps=12, multiimage_algo="stochastic", mesh_simplify=0.95, texture_size=1024, api_name="/generate_and_extract_glb")
    record["trellisEventId"] = getattr(job, "event_id", None)
    save(path, record)
    result = job.result()
    glb = next((Path(item) for item in result if isinstance(item, str) and item.lower().endswith(".glb") and Path(item).is_file()), None)
    if glb is None:
        raise ValueError("TRELLIS returned no local GLB")
    output = folder / "character.glb"
    shutil.copyfile(glb, output)  # This source was generated NOW, never a pre-start asset.
    record.update(glbPath=str(output), trellisSeconds=round(time.perf_counter() - started, 3), generationFinishedAt=now(), status="generated", **validate_glb(output))
    save(path, record)


def work(order_id, prompt, generation_prompt=None, source="NIUMA WORKS 团队自拟", upload=None, approve=False, seed=42):
    from vercel.blob.sync import get_blob, put_blob
    w3, contract = chain()
    order = contract.functions.orders(order_id).call()
    if bytes(order[1]) != bytes(prompt_hash(prompt)):
        raise ValueError("Exact original prompt does not match on-chain promptHash")
    if order[3] not in (0, 1, 2):
        raise ValueError("Order is not Funded, Delivered or Paid")
    if order[3] == 0 and w3.eth.get_block("latest")["timestamp"] > order[2]:
        raise ValueError("Order expired; buyer can refund before any generation")
    folder = RUNTIME / "orders" / str(order_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "job.json"
    record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"orderId": order_id, "prompt": prompt, "generationPrompt": (generation_prompt or prompt) + SUFFIX, "source": source, "seed": seed, "mode": "uploaded" if upload else "generated", "createdAt": now(), "status": "queued"}
    if record["prompt"] != prompt:
        raise ValueError("Existing local record has a different prompt")
    if source and record.get("source") != source:
        record.setdefault("sourceHistory", []).append({"previous": record.get("source"), "correctedTo": source, "at": now(), "reason": "Explicit local worker/demo provenance"})
        record["source"] = source
        save(path, record)
    if order[3] == 0 and not record.get("glbPath"):
        # The persistent GPU marker survives process failures; the lock handles concurrent workers.
        lock = folder / "worker.lock"
        with lock.open("x", encoding="utf-8") as stream:
            stream.write(now())
        try:
            if upload:
                info = validate_glb(upload)
                destination = folder / "character.glb"
                shutil.copyfile(Path(upload), destination)
                record.update(glbPath=str(destination), mode="uploaded", status="generated", **info)
                save(path, record)
            else:
                generate(record, folder, path)
        except Exception as error:
            # Only a definitive model error permits cancellation. Connectivity/unknown state stays on hold.
            from gradio_client.exceptions import AppError
            definite_failure = isinstance(error, (AppError, ValueError))
            record.update(status="generation-failed" if definite_failure else "needs-reconciliation", error=safe_error(error), failedAt=now())
            save(path, record)
            if definite_failure:
                cancel, _ = send(w3, contract.functions.cancel(order_id), "OPERATOR", f"order-{order_id}-cancel")
                record["cancelTransaction"] = cancel
                record["status"] = "refunded-withdrawable"
            save(path, record)
            publish_progress(record)
            raise
        finally:
            lock.unlink(missing_ok=True)
    if order[3] == 0:
        if not record.get("url"):
            data = Path(record["glbPath"]).read_bytes()
            uploaded = put_blob(blob_path(order_id, record["sha256"] + ".glb"), data, access=BLOB_ACCESS, content_type="model/gltf-binary", allow_overwrite=False)
            record.update(url=uploaded.url, blobAccess=BLOB_ACCESS, status="uploaded")
            save(path, record)
        downloaded = get_blob(record["url"], access=BLOB_ACCESS).body
        download = folder / "downloaded.glb"
        download.write_bytes(downloaded)
        info = validate_glb(download)
        if info["sha256"] != record["sha256"]:
            raise ValueError("Downloaded Blob SHA-256 mismatch; refusing delivery")
        record["downloadedSha256"] = info["sha256"]
        tx, receipt = send(w3, contract.functions.deliver(order_id, bytes.fromhex(record["sha256"]), record["url"]), "OPERATOR", f"order-{order_id}-deliver")
        events = contract.events.Delivered().process_receipt(receipt)
        record.update(deliverTransaction=tx, characterId=events[0]["args"]["characterId"], status="delivered")
        save(path, record)
    else:
        record["characterId"] = order[4]
    if approve and contract.functions.orders(order_id).call()[3] == 1:
        buyer = w3.eth.account.from_key(os.environ["BUYER_PRIVATE_KEY"]).address
        if buyer.lower() != order[0].lower():
            raise ValueError("Configured BUYER is not this order's buyer")
        tx, _ = send(w3, contract.functions.approve(order_id), "BUYER", f"order-{order_id}-approve")
        record.update(approveTransaction=tx, status="paid")
        save(path, record)
    character = contract.functions.characters(record["characterId"]).call()
    if record.get("sha256") and bytes(character[1]).hex() != record["sha256"]:
        raise ValueError("On-chain character SHA-256 mismatch")
    record["onchainSha256"] = bytes(character[1]).hex()
    record["status"] = {0: "funded", 1: "delivered", 2: "paid"}[contract.functions.orders(order_id).call()[3]]
    save(path, record)
    record["progressUrl"] = publish_progress(record)
    save(path, record)
    public = {k: v for k, v in record.items() if k not in {"glbPath", "imagePath"}}
    save(ROOT / "evidence/orders" / f"{order_id}.json", public)
    return public


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--order-id", type=int, required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--generation-prompt", help="Optional English rendering; original prompt is committed unchanged")
    parser.add_argument("--source", default="NIUMA WORKS 团队自拟")
    parser.add_argument("--upload", type=Path, help="User-supplied GLB; recorded as uploaded asset")
    parser.add_argument("--approve", action="store_true", help="Only for the team's explicitly authorized demo buyer")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    try:
        result = work(args.order_id, args.prompt, args.generation_prompt, args.source, args.upload, args.approve, args.seed)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": safe_error(error)}, ensure_ascii=False))
        raise SystemExit(1)
