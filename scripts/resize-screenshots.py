#!/usr/bin/env python3
"""Resize screenshots/*.png to the Chrome Web Store's required 1280x800 canvas.

Each source image is scaled to fit within 1280x800 (preserving aspect ratio,
never upscaled beyond that box) and centered on an opaque background, since
the Web Store rejects screenshots with alpha channels or the wrong exact
dimensions. Output goes to screenshots/store/, alongside the originals.
"""

from pathlib import Path
from PIL import Image

TARGET_SIZE = (1280, 800)
BACKGROUND = (18, 18, 20)  # near-black, matches dark UI; change if needed

SRC_DIR = Path(__file__).resolve().parent.parent / "screenshots"
OUT_DIR = SRC_DIR / "store"


def resize_to_canvas(src_path: Path, dest_path: Path) -> None:
    with Image.open(src_path) as im:
        im = im.convert("RGB") if im.mode != "RGBA" else im

        target_w, target_h = TARGET_SIZE
        scale = min(target_w / im.width, target_h / im.height)
        # Only downscale — never enlarge past native resolution.
        scale = min(scale, 1.0)
        new_size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
        resized = im.resize(new_size, Image.LANCZOS)

        canvas = Image.new("RGB", TARGET_SIZE, BACKGROUND)
        offset = ((target_w - new_size[0]) // 2, (target_h - new_size[1]) // 2)
        if resized.mode == "RGBA":
            canvas.paste(resized, offset, resized)
        else:
            canvas.paste(resized, offset)

        canvas.save(dest_path, "PNG")
        print(f"  {src_path.name} ({im.size[0]}x{im.size[1]}) -> {dest_path.name} (1280x800)")


def main() -> None:
    if not SRC_DIR.exists():
        raise SystemExit(f"No screenshots directory at {SRC_DIR}")

    OUT_DIR.mkdir(exist_ok=True)

    images = sorted(SRC_DIR.glob("*.png"))
    if not images:
        raise SystemExit(f"No .png files found in {SRC_DIR}")

    print(f"Resizing {len(images)} screenshot(s) to 1280x800 -> {OUT_DIR}")
    for src in images:
        dest = OUT_DIR / src.name
        resize_to_canvas(src, dest)

    print("Done.")


if __name__ == "__main__":
    main()
