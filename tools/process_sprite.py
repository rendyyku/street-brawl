#!/usr/bin/env python3
"""
Chroma-key (#FF00FF) processor for Street Brawl sprite sheets and 1x6 multi-frame strips.

Usage:
  python3 tools/process_sprite.py input.png assets/fighters/nadia_ultimate.webp
  python3 tools/process_sprite.py input.png assets/fighters/nadia_cutin.webp --no-chromakey --width 1024
"""
import argparse
import numpy as np
from PIL import Image


def remove_magenta(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert('RGBA'), dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    magenta_score = np.minimum(r, b) - g

    is_bg = (r > 150) & (b > 150) & (g < 120) & (magenta_score > 75)
    soft_bg = (r > 120) & (b > 120) & (g < 140) & (magenta_score > 35) & (~is_bg)

    out = arr.copy()
    out[is_bg, 3] = 0
    despill = np.clip((magenta_score - 35) / 55.0, 0.0, 1.0)
    out[soft_bg, 3] = np.clip(arr[soft_bg, 3] * (1.0 - despill[soft_bg]), 0, 255)
    out[soft_bg, 0] = np.minimum(out[soft_bg, 0], g[soft_bg] + 20)
    out[soft_bg, 2] = np.minimum(out[soft_bg, 2], g[soft_bg] + 20)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def main():
    parser = argparse.ArgumentParser(description='Process Street Brawl fighter sprites to WebP.')
    parser.add_argument('input', help='Input PNG/JPG image')
    parser.add_argument('output', help='Output WebP path')
    parser.add_argument('--no-chromakey', action='store_true', help='Keep background (e.g. 16:9 Ultimate cut-in)')
    parser.add_argument('--width', type=int, default=0, help='Optional resize width (keeps aspect ratio)')
    args = parser.parse_args()

    im = Image.open(args.input).convert('RGBA')
    if args.width > 0 and im.width > args.width:
        h = max(1, round(im.height * (args.width / im.width)))
        im = im.resize((args.width, h), Image.Resampling.LANCZOS)

    if not args.no_chromakey:
        im = remove_magenta(im)

    im.save(args.output, format='WEBP', quality=90, method=6)
    print(f'Saved {args.output} ({im.size[0]}x{im.size[1]})')


if __name__ == '__main__':
    main()
