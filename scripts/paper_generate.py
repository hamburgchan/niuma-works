"""Retired historical image-only pipeline: CPU translation -> Pollinations -> transparent PNG.

No FLUX, TRELLIS, GLB or GPU Space calls. Network/image failures use a visibly
labeled deterministic procedural character, not a substituted claimed AI result.
"""
import hashlib
import json
import os
import random
import re
import secrets
import time
from pathlib import Path
from urllib.parse import quote
import httpx
from PIL import Image, ImageDraw
from vercel.blob.sync import head_blob, put_blob
from vercel.blob.errors import BlobNotFoundError
from web3.logs import DISCARD
from niuma import ROOT, RUNTIME, blob_path, chain, now, prompt_hash, publish_progress, safe_error, save, send
from paper_assets import prepare, validate

SUFFIX = "pixel art paper cutout character, chibi abstract style, dopey unfocused eyes, drooling, wearing ID badge, full body, front view, plain white background"
_translator = None

def require_isolated(info):
    # Reject the known board-shaped Pollinations/rembg outputs BEFORE delivery.
    # This is a conservative quality heuristic, not a semantic image guarantee.
    if not 0.28 <= info["transparentFraction"] <= 0.85:
        raise ValueError("Foreground isolation quality check failed; use procedural fallback")
    return info

def translate(prompt):
    if not re.search(r"[\u3400-\u9fff]", prompt): return prompt
    global _translator
    if _translator is None:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
        import torch
        torch.set_num_threads(2)
        snapshots = RUNTIME / "translation-model/models--Helsinki-NLP--opus-mt-zh-en/snapshots"
        installed = sorted(snapshots.iterdir()) if snapshots.exists() else []
        if not installed: raise ValueError("Local Chinese-English translation model is unavailable")
        folder = str(installed[-1])
        tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, token=False)
        weights = AutoModelForSeq2SeqLM.from_pretrained(folder, local_files_only=True, token=False)
        weights.eval()
        _translator = tokenizer, weights
    tokenizer, weights = _translator
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
    return tokenizer.decode(weights.generate(**inputs, max_new_tokens=128)[0], skip_special_tokens=True)

def procedural(prompt, destination):
    rng = random.Random(int.from_bytes(bytes(prompt_hash(prompt)), "big"))
    image = Image.new("RGBA", (128, 160))
    draw = ImageDraw.Draw(image)
    ink = "#343231"
    skin = rng.choice(["#baa3d1", "#d6b38a", "#d2d4a4", "#b2ced0", "#e2b9b9"])
    shirt = rng.choice(["#688da5", "#8c9d69", "#9d7f9e", "#c28c66"])
    def block(box, color, edge=True): draw.rectangle(box, fill=color, outline=ink if edge else color, width=3)
    ears = rng.choice(["long", "horns", "round"])
    if ears == "long": block((24, 3, 43, 39), skin); block((85, 3, 104, 39), skin)
    elif ears == "horns": block((29, 6, 42, 36), "#e8d8aa"); block((86, 6, 99, 36), "#e8d8aa")
    else: block((14, 27, 37, 51), skin); block((91, 27, 114, 51), skin)
    block((26, 29, 102, 87), skin)
    block((34, 86, 94, 139), shirt)
    block((20, 91, 35, 126), skin); block((93, 91, 108, 126), skin)
    block((37, 137, 58, 153), "#68636c"); block((70, 137, 91, 153), "#68636c")
    block((34, 49, 58, 64), "#f8f5e8"); block((70, 49, 94, 64), "#f8f5e8")
    draw.rectangle((48, 51, 53, 59), fill=ink); draw.rectangle((72, 54, 77, 62), fill=ink)
    block((57, 72, 75, 81), "#b77d83")
    draw.rectangle((69, 78, 74, 95), fill="#94d7ec"); draw.rectangle((67, 90, 76, 97), fill="#94d7ec")
    draw.line((43, 88, 64, 112, 85, 88), fill="#dfc975", width=4)
    block((51, 111, 80, 133), "#f8f5e8")
    draw.rectangle((56, 117, 62, 124), fill="#a7b7c3"); draw.rectangle((67, 117, 75, 120), fill=ink)
    image.resize((410, 512), Image.Resampling.NEAREST).save(destination, optimize=True)

def generate(record, folder, path):
    output = folder / "character.png"
    record.setdefault("seed", secrets.randbelow(2**31))
    record.update(status="generating-image", assetType="png")
    save(path, record); publish_progress(record)
    started = time.perf_counter()
    try:
        english = translate(record["prompt"])
        record.update(englishPrompt=english, generationPrompt=f"{english}, {SUFFIX}")
        save(path, record)
        response = httpx.get(f"https://image.pollinations.ai/prompt/{quote(record['generationPrompt'], safe='')}", params={"width":512,"height":512,"seed":record["seed"]}, timeout=20, follow_redirects=True)
        response.raise_for_status()
        if len(response.content) > 8_000_000: raise ValueError("Image exceeds 8MB")
        source = folder / "pollinations-source.png"
        source.write_bytes(response.content)
        with Image.open(source) as decoded:
            if decoded.width * decoded.height > 4_000_000: raise ValueError("Image dimensions exceed limit")
            image = decoded.convert("RGBA")
        # Only the requested Pollinations source gets the bottom-right watermark crop.
        image.paste((0,0,0,0), (int(image.width*.60), int(image.height*.88), image.width, image.height))
        corners = [image.getpixel((x,y))[:3] for x,y in [(0,0),(image.width-1,0),(0,image.height-1)]]
        floor = min(236, max(180, min(sum(c)//3 for c in corners) - 12))
        image.save(source)
        try:
            processing = require_isolated(prepare(source, output, minimum_channel=floor))
        except ValueError:
            from rembg import remove, new_session
            os.environ["U2NET_HOME"] = str(RUNTIME / "models")
            os.environ["REMBG_HOME"] = str(RUNTIME / "models")
            session = new_session("u2net", providers=["CPUExecutionProvider"])
            cutout = remove(image.convert("RGB"), session=session, post_process_mask=True).convert("RGBA")
            cutout.save(folder / "rembg-source.png")
            processing = require_isolated(prepare(folder / "rembg-source.png", output))
            processing["method"] = "CPU rembg u2net after insufficient edge flood fill"
        record.update(generationSource="Pollinations API 生成", generationMethod="pollinations", backgroundRemoval=processing,
                      watermarkRemoval="Bottom-right 40% by 12% region removed before foreground crop")
    except Exception as error:
        record["generationFailure"] = safe_error(error)[:400]
        procedural(record["prompt"], output)
        record.update(generationSource="程序化生成", generationMethod="procedural", fallbackReason=record["generationFailure"])
    record.update(pngPath=str(output), status="generated", generationSeconds=round(time.perf_counter()-started,3), **validate(output))
    save(path, record); publish_progress(record)

def work(order_id, prompt, source="用户委托"):
    raise RuntimeError("Recruitment is paused. Historical generation and Blob publishing are disabled.")
    w3, contract = chain()
    order = contract.functions.orders(order_id).call()
    if bytes(order[1]) != bytes(prompt_hash(prompt)): raise ValueError("Exact promptHash mismatch")
    if order[3] not in (0,1,2): raise ValueError("Order is not funded/delivered/paid")
    folder = RUNTIME / "orders" / str(order_id); folder.mkdir(parents=True, exist_ok=True)
    path = folder / "job.json"
    record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else dict(orderId=order_id, prompt=prompt, source=source, assetType="png", mode="generated", status="queued", createdAt=now())
    if record["prompt"] != prompt: raise ValueError("Stored prompt mismatch")
    if order[3] == 0:
        if w3.eth.get_block("latest")["timestamp"] > order[2]: raise ValueError("Order expired; buyer can refund")
        if not record.get("pngPath"):
            with (folder / "worker.lock").open("x", encoding="utf-8") as lock:
                lock.write(now())
            try:
                put_blob(blob_path(order_id,"paper-claim.json"), json.dumps(dict(orderId=order_id, startedAt=now())).encode(), access="public", content_type="application/json", allow_overwrite=False)
                generate(record, folder, path)
            finally: (folder / "worker.lock").unlink(missing_ok=True)
        if not record.get("motionPresets"):
            record.update(motionPresets=["waddle","hop","squash"], motionType="client-side procedural presets", status="preparing-motion")
            save(path,record); publish_progress(record)
        if not record.get("url"):
            asset = Path(record["pngPath"]); info = validate(asset)
            pathname = blob_path(order_id, f"{record['generationMethod']}/{info['sha256']}.png")
            try: uploaded = head_blob(pathname)
            except BlobNotFoundError: uploaded = put_blob(pathname, asset.read_bytes(), access="public", content_type="image/png", allow_overwrite=False)
            record.update(url=uploaded.url, blobAccess="public", status="uploaded")
            save(path, record)
        response = httpx.get(record["url"], timeout=40); response.raise_for_status()
        if hashlib.sha256(response.content).hexdigest() != record["sha256"]: raise ValueError("Public download hash mismatch")
        record.update(status="delivering"); save(path,record); publish_progress(record)
        tx, receipt = send(w3, contract.functions.deliver(order_id, bytes.fromhex(record["sha256"]),record["url"]), "OPERATOR", f"paper-order-{order_id}-deliver")
        record.update(characterId=contract.events.Delivered().process_receipt(receipt,errors=DISCARD)[0]["args"]["characterId"], deliverTransaction=tx, publicDownloadVerified=True)
    else: record["characterId"] = order[4]
    record["status"] = "paid" if contract.functions.orders(order_id).call()[3] == 2 else "delivered"
    save(path, record); publish_progress(record)
    public = {k:v for k,v in record.items() if k != "pngPath"}
    save(ROOT / "evidence/orders" / f"{order_id}.json", public)
    return public
