#!/usr/bin/env python3
"""
Street Brawl asset processor: chroma-key (#FF00FF) cleanup -> transparent WebP.

Modes
  sheet   4x4 sprite sheet. Removes magenta, trims white borders, deletes stray
          fragments that leaked in from a neighbouring cell, writes WebP.
          --portrait <out.webp> also renders the 160x160 roster portrait.
  strip   1xN horizontal animation strip (default 6 frames). Splits frames at the
          emptiest columns ("valleys") near each expected boundary so no pose is
          cut in half, then re-packs them into equal cells aligned on the foot line.
  cutin   16:9 Ultimate cut-in. No chroma-key; trims white borders, resizes.

Usage
  python tools/process_sprite.py sheet  raw/owi_sheet.png    assets/fighters/owi_sheet.webp --portrait assets/fighters/owi_portrait.webp
  python tools/process_sprite.py strip  raw/owi_ultimate.png assets/fighters/owi_ultimate.webp --frames 6
  python tools/process_sprite.py cutin  raw/owi_cutin.png    assets/fighters/owi_cutin.webp

Legacy form (still supported):
  python tools/process_sprite.py input.png output.webp [--no-chromakey] [--width N]
"""
import argparse
import sys

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:  # fragment cleanup is skipped without scipy
    ndimage = None

PORTRAIT_BG = (28, 18, 49)


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


def trim_white_border(im: Image.Image, thresh: int = 235, min_frac: float = 0.97) -> Image.Image:
    """Image generators sometimes add a white frame/strip on the edges; crop those rows/cols."""
    arr = np.array(im.convert('RGB')).astype(int)
    white = (arr > thresh).all(axis=2)
    top, bottom, left, right = 0, arr.shape[0], 0, arr.shape[1]
    while top < bottom - 1 and white[top].mean() >= min_frac:
        top += 1
    while bottom - 1 > top and white[bottom - 1].mean() >= min_frac:
        bottom -= 1
    while left < right - 1 and white[:, left].mean() >= min_frac:
        left += 1
    while right - 1 > left and white[:, right - 1].mean() >= min_frac:
        right -= 1
    if (top, bottom, left, right) == (0, arr.shape[0], 0, arr.shape[1]):
        return im
    return im.crop((left, top, right, bottom))


def remove_edge_fragments(cell: np.ndarray, max_frac: float = 0.06) -> int:
    """
    Deletes small opaque blobs that touch the cell edge (e.g. a fireball tail that
    bled over from the neighbouring cell). Returns how many blobs were removed.
    """
    if ndimage is None:
        return 0
    alpha = cell[:, :, 3] > 10
    labels, n = ndimage.label(alpha)
    if n <= 1:
        return 0
    sizes = ndimage.sum(alpha, labels, range(1, n + 1))
    biggest = sizes.max()
    removed = 0
    h, w = alpha.shape
    for i, size in enumerate(sizes, start=1):
        if size >= biggest * max_frac:
            continue
        ys, xs = np.where(labels == i)
        touches = xs.min() == 0 or ys.min() == 0 or xs.max() == w - 1 or ys.max() == h - 1
        if touches:
            cell[labels == i, 3] = 0
            removed += 1
    return removed


def process_sheet(src: Image.Image, size: int = 1024) -> Image.Image:
    im = trim_white_border(src.convert('RGBA'))
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    im = remove_magenta(im)
    arr = np.array(im)
    cw = size // 4
    removed = 0
    for row in range(4):
        for col in range(4):
            removed += remove_edge_fragments(arr[row * cw:(row + 1) * cw, col * cw:(col + 1) * cw])
    if removed:
        print(f'  removed {removed} leaked fragment(s) at cell edges')
    return Image.fromarray(arr, 'RGBA')


def make_portrait(sheet: Image.Image, size: int = 160) -> Image.Image:
    """Full-body idle pose (cell 0) on the roster's dark backdrop, feet near the bottom."""
    cw = sheet.width // 4
    cell = sheet.crop((0, 0, cw, cw))
    bbox = cell.getbbox()
    if bbox:
        cell = cell.crop(bbox)
    scale = (size - 10) / max(cell.size)
    cell = cell.resize((max(1, round(cell.width * scale)), max(1, round(cell.height * scale))), Image.Resampling.LANCZOS)
    bg = Image.new('RGBA', (size, size), PORTRAIT_BG + (255,))
    bg.alpha_composite(cell, ((size - cell.width) // 2, size - cell.height - 4))
    return bg.convert('RGB')


def find_split_columns(alpha: np.ndarray, frames: int) -> list:
    """Pick the emptiest column near each expected frame boundary."""
    w = alpha.shape[1]
    coverage = (alpha > 10).sum(axis=0).astype(float)
    # Light smoothing so a single empty column inside a pose doesn't win
    coverage = np.convolve(coverage, np.ones(5) / 5, mode='same')
    cuts = [0]
    window = w // (frames * 3)
    for i in range(1, frames):
        expected = round(i * w / frames)
        lo, hi = max(cuts[-1] + 1, expected - window), min(w - 1, expected + window)
        cuts.append(int(lo + np.argmin(coverage[lo:hi + 1])))
    cuts.append(w)
    return cuts


def process_strip(src: Image.Image, frames: int = 6, height: int = 320) -> Image.Image:
    im = trim_white_border(src.convert('RGBA'))
    im = remove_magenta(im)
    arr = np.array(im)
    cuts = find_split_columns(arr[:, :, 3], frames)
    pieces = []
    for i in range(frames):
        piece = Image.fromarray(arr[:, cuts[i]:cuts[i + 1]], 'RGBA')
        pieces.append(piece.crop(piece.getbbox()) if piece.getbbox() else piece)
    # Equal cells: widest frame, every pose bottom-aligned on the same foot line
    cell_w = max(p.width for p in pieces) + 8
    cell_h = max(p.height for p in pieces) + 8
    out = Image.new('RGBA', (cell_w * frames, cell_h), (0, 0, 0, 0))
    for i, p in enumerate(pieces):
        out.alpha_composite(p, (i * cell_w + (cell_w - p.width) // 2, cell_h - p.height - 4))
    scale = height / cell_h
    print(f'  split columns: {cuts}')
    return out.resize((max(frames, round(out.width * scale)), height), Image.Resampling.LANCZOS)


def process_cutin(src: Image.Image, width: int = 1024) -> Image.Image:
    im = trim_white_border(src.convert('RGB'))
    h = round(width * 9 / 16)
    # Cover-crop to exactly 16:9
    scale = max(width / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    left, top = (im.width - width) // 2, (im.height - h) // 2
    return im.crop((left, top, left + width, top + h))


def save_webp(im: Image.Image, path: str):
    im.save(path, format='WEBP', quality=90, method=6)
    print(f'Saved {path} ({im.size[0]}x{im.size[1]})')


def legacy_main(argv):
    parser = argparse.ArgumentParser(description='Process Street Brawl fighter sprites to WebP.')
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--no-chromakey', action='store_true')
    parser.add_argument('--width', type=int, default=0)
    args = parser.parse_args(argv)
    im = Image.open(args.input).convert('RGBA')
    if args.width > 0 and im.width > args.width:
        h = max(1, round(im.height * (args.width / im.width)))
        im = im.resize((args.width, h), Image.Resampling.LANCZOS)
    if not args.no_chromakey:
        im = remove_magenta(im)
    save_webp(im, args.output)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in ('sheet', 'strip', 'cutin'):
        return legacy_main(argv)

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mode', choices=['sheet', 'strip', 'cutin'])
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--portrait', help='sheet mode: also write a 160x160 roster portrait here')
    parser.add_argument('--frames', type=int, default=6, help='strip mode: frame count (default 6)')
    parser.add_argument('--height', type=int, default=320, help='strip mode: output height (default 320)')
    parser.add_argument('--size', type=int, default=1024, help='sheet: square size / cutin: width (default 1024)')
    args = parser.parse_args(argv)

    src = Image.open(args.input)
    if args.mode == 'sheet':
        sheet = process_sheet(src, args.size)
        save_webp(sheet, args.output)
        if args.portrait:
            save_webp(make_portrait(sheet), args.portrait)
    elif args.mode == 'strip':
        save_webp(process_strip(src, args.frames, args.height), args.output)
    else:
        save_webp(process_cutin(src, args.size), args.output)


if __name__ == '__main__':
    main()
