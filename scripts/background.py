"""Explicit, validated foreground extraction before TRELLIS conditioning."""
import hashlib
import os
from pathlib import Path


def prepare_image(source, folder):
    from PIL import Image
    cache = Path(__file__).resolve().parents[1] / ".runtime" / "models"
    os.environ.setdefault("U2NET_HOME", str(cache))
    os.environ.setdefault("REMBG_HOME", str(cache))
    from rembg import new_session, remove
    original = Image.open(source)
    # Never trust an almost-opaque alpha channel from a generated WebP.
    cutout = remove(original.convert("RGB"), session=new_session("u2net", providers=["CPUExecutionProvider"])).convert("RGBA")
    alpha = cutout.getchannel("A")
    histogram = alpha.histogram()
    transparent = sum(histogram[:16]) / (cutout.width * cutout.height)
    bbox = alpha.point(lambda value: 255 if value > 204 else 0).getbbox()
    if not bbox or transparent < 0.15 or transparent > 0.97:
        raise ValueError("Background removal did not produce a plausible isolated character")
    foreground = Path(folder) / "foreground.png"
    cutout.save(foreground)
    # Match the official pipeline's 20% padded foreground framing and black RGB
    # conditioning. generate_and_extract_glb calls pipeline.run(preprocess_image=False).
    side = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 1.2)
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    framed = cutout.crop((int(cx-side/2), int(cy-side/2), int(cx+side/2), int(cy+side/2))).resize((518,518), Image.Resampling.LANCZOS)
    conditioned = Image.new("RGB", framed.size, (0,0,0))
    conditioned.paste(framed.convert("RGB"), mask=framed.getchannel("A"))
    target = Path(folder) / "trellis-conditioning.png"
    conditioned.save(target)
    return target, {"method":"rembg/u2net CPU; force RGB before segmentation", "transparentFraction":round(transparent,4), "foregroundBounds":list(bbox), "conditioningSize":[518,518], "foregroundSha256":hashlib.sha256(foreground.read_bytes()).hexdigest(), "conditioningSha256":hashlib.sha256(target.read_bytes()).hexdigest()}
