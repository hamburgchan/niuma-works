"""Conservative edge-connected background removal for post-start paper assets."""
import argparse
import hashlib
import json
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter


def prepare(source, destination, preserve_sticker=False, minimum_channel=236):
    image = Image.open(source).convert("RGBA")
    rgba = np.array(image)
    rgb = rgba[:, :, :3].astype(np.int16)
    # Only near-neutral, near-white pixels connected to the four edges are removed.
    # Interior cream wool and eyes are never selected merely by their color.
    eligible = (rgb.min(2) >= minimum_channel) & ((rgb.max(2) - rgb.min(2)) <= 14)
    eligible |= rgba[:, :, 3] == 0
    height, width = eligible.shape
    removed = np.zeros((height, width), dtype=bool)
    queue = deque()
    def add(x, y):
        if eligible[y, x] and not removed[y, x]:
            removed[y, x] = True
            queue.append((x, y))
    for x in range(width):
        add(x, 0); add(x, height - 1)
    for y in range(height):
        add(0, y); add(width - 1, y)
    while queue:
        x, y = queue.popleft()
        if x: add(x - 1, y)
        if x + 1 < width: add(x + 1, y)
        if y: add(x, y - 1)
        if y + 1 < height: add(x, y + 1)
    mask = Image.fromarray((~removed * 255).astype("uint8"))
    if preserve_sticker:
        # White-on-white sticker perimeter is indistinguishable by color alone.
        # Retain a narrow band of ORIGINAL pixels surrounding the connected ink.
        mask = mask.filter(ImageFilter.MaxFilter(17))
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.array(mask))
    result = Image.fromarray(rgba)
    bounds = result.getbbox()
    if not bounds: raise ValueError("No foreground survived background removal")
    result = result.crop(bounds)
    padded = Image.new("RGBA", (result.width + 24, result.height + 24))
    padded.alpha_composite(result, (12, 12))
    result = padded.resize((round(padded.width * 512 / padded.height), 512), Image.Resampling.NEAREST)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination, optimize=True)
    info = validate(destination)
    info.update(method="four-edge flood fill", minimumChannel=minimum_channel, maximumChroma=14,
                preservesInteriorLightRegions=True, preserveSticker=preserve_sticker,
                resize="nearest-neighbor", removedBackgroundPixels=int(removed.sum()))
    return info


def validate(path):
    data = Path(path).read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"): raise ValueError("PNG signature required")
    with Image.open(path) as image:
        image.load()
        if image.mode != "RGBA": raise ValueError("RGBA PNG required")
        if image.getchannel("A").getextrema() != (0, 255): raise ValueError("Transparent background and opaque foreground required")
        if image.height != 512 or len(data) > 300000: raise ValueError("Asset must be 512px high and under 300KB")
        histogram = image.getchannel("A").histogram()
        transparent_fraction = sum(histogram[:16]) / (image.width * image.height)
        if transparent_fraction < 0.18: raise ValueError("Background removal insufficient: less than 18% transparent canvas")
        return dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), width=image.width, height=image.height, assetType="png", transparentFraction=round(transparent_fraction,4))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[2] / "uploads")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / ".runtime/paper-previews")
    args = parser.parse_args()
    results = {}
    for name in ("mule", "alpaca", "programmer"):
        results[name] = prepare(args.source / f"{name}.png", args.output / f"{name}.png", name == "programmer")
    (args.output / "processing.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False))
