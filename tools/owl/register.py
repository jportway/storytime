"""Turn generated drawings into animation frames that sit still.

Three jobs, none of them AI:

1. Key ink to alpha (see common.ink_alpha) so the owl can sit on the app's
   paper colour instead of a rectangle of someone else's paper.
2. Align every frame to a common origin. This is the step people skip, and
   it is why AI-generated animation usually wobbles: the model redraws the
   owl a few pixels over each time, and a few pixels at 24fps reads as the
   whole character vibrating.
3. Crop and pad everything to one canvas, then write a sprite sheet per pose.

Alignment is by phase correlation over the alpha channel — exact for pure
translation, O(n log n), and no feature detection to go wrong. Rotation and
scale drift are *not* corrected: if the model changes those, the frame is
rejected rather than warped, because warping brushwork looks like warped
brushwork.

    python register.py                    # everything in frames/
    python register.py --size 384 --pose blink-shut
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import content_bbox, ink_alpha  # noqa: E402

HERE = pathlib.Path(__file__).parent
FRAMES = HERE / 'frames'
OUT = HERE.parent.parent / 'web' / 'public' / 'owl'


def phase_shift(ref: np.ndarray, img: np.ndarray) -> tuple[int, int]:
    """Translation (dy, dx) that best maps `img` onto `ref`."""
    fa = np.fft.rfft2(ref)
    fb = np.fft.rfft2(img)
    cross = fa * np.conj(fb)
    mag = np.abs(cross)
    mag[mag == 0] = 1e-12
    corr = np.fft.irfft2(cross / mag, s=ref.shape)
    peak = np.unravel_index(np.argmax(corr), corr.shape)
    dy, dx = peak
    # Wrap to signed shifts.
    if dy > ref.shape[0] // 2:
        dy -= ref.shape[0]
    if dx > ref.shape[1] // 2:
        dx -= ref.shape[1]
    return int(dy), int(dx)


def shift_alpha(alpha: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(alpha)
    h, w = alpha.shape
    ys, ye = max(0, dy), min(h, h + dy)
    xs, xe = max(0, dx), min(w, w + dx)
    out[ys:ye, xs:xe] = alpha[ys - dy:ye - dy, xs - dx:xe - dx]
    return out


def scale_of(alpha: np.ndarray) -> float:
    """A proxy for how big the owl is drawn, as total ink laid down.

    Deliberately not the bounding box: a pose that genuinely changes the
    silhouette — a tilted head lifting the ear tufts — moves the box several
    percent without the owl being drawn any larger, and rejecting those
    throws away good frames. Ink mass barely moves under a tilt and moves a
    lot under an actual scale change, which is the thing worth catching.
    """
    return float(alpha.sum())


def load_pose(pose_dir: pathlib.Path) -> list[tuple[str, np.ndarray]]:
    out = []
    for f in sorted(pose_dir.glob('*.png')):
        if f.name == 'chosen.png':
            continue
        out.append((f.stem, ink_alpha(f)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=384, help='output frame size')
    ap.add_argument('--pose', action='append')
    ap.add_argument('--tolerance', type=float, default=0.18,
                    help='max ink-mass drift before a frame is rejected')
    args = ap.parse_args()

    pose_dirs = [p for p in sorted(FRAMES.iterdir()) if p.is_dir()]
    if args.pose:
        pose_dirs = [p for p in pose_dirs if p.name in args.pose]

    # Everything aligns to one reference so poses are mutually registered,
    # not just internally consistent — otherwise the owl jumps when the
    # animation switches from blinking to talking.
    ref_pose = FRAMES / 'blink-shut'
    ref_files = load_pose(ref_pose if ref_pose.exists() else pose_dirs[0])
    if not ref_files:
        print('no frames to register', file=sys.stderr)
        return
    reference = ref_files[0][1]
    ref_mass = scale_of(reference)

    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, int] = {}
    aligned: dict[str, list[np.ndarray]] = {}
    rejected: list[str] = []

    for pose_dir in pose_dirs:
        kept = []
        for name, alpha in load_pose(pose_dir):
            mass = scale_of(alpha)
            drift = abs(mass - ref_mass) / ref_mass
            if drift > args.tolerance:
                # Warping brushwork to fix scale looks like warped brushwork,
                # so an off-scale frame is dropped rather than corrected.
                rejected.append(f'{name} (ink mass {drift * 100:.1f}% off reference)')
                continue
            dy, dx = phase_shift(reference, alpha)
            kept.append(shift_alpha(alpha, dy, dx))
            print(f'  {name}: shift ({dx:+d}, {dy:+d})')
        if kept:
            aligned[pose_dir.name] = kept

    if not aligned:
        print('nothing survived registration', file=sys.stderr)
        return

    # One canvas for every pose, from the union of all content.
    union = None
    for frames in aligned.values():
        for a in frames:
            box = content_bbox(a)
            if box is None:
                continue
            union = box if union is None else (
                min(union[0], box[0]), min(union[1], box[1]),
                max(union[2], box[2]), max(union[3], box[3]),
            )

    x0, y0, x1, y1 = union
    side = max(x1 - x0, y1 - y0)
    pad = int(side * 0.04)
    side += pad * 2
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    x0, y0 = cx - side // 2, cy - side // 2

    size = args.size
    for pose, frames in aligned.items():
        sheet = Image.new('RGBA', (size * len(frames), size), (0, 0, 0, 0))
        for i, a in enumerate(frames):
            crop = a[max(0, y0):y0 + side, max(0, x0):x0 + side]
            padded = np.zeros((side, side), dtype=a.dtype)
            padded[:crop.shape[0], :crop.shape[1]] = crop
            rgba = np.zeros((side, side, 4), dtype=np.uint8)
            rgba[..., 0], rgba[..., 1], rgba[..., 2] = 26, 22, 18
            rgba[..., 3] = (padded * 255).round().astype(np.uint8)
            frame = Image.fromarray(rgba, 'RGBA').resize((size, size), Image.LANCZOS)
            sheet.paste(frame, (i * size, 0))
        sheet.save(OUT / f'{pose}.webp', 'WEBP', quality=88, method=6)
        manifest[pose] = len(frames)
        kb = (OUT / f'{pose}.webp').stat().st_size / 1024
        print(f'{pose}: {len(frames)} frames -> {kb:.0f} KB')

    # The start screen shows him large and still, so it gets one crisp
    # drawing rather than a scaled-up animation frame.
    still = aligned.get('idle', [next(iter(aligned.values()))])[0]
    crop = still[max(0, y0):y0 + side, max(0, x0):x0 + side]
    padded = np.zeros((side, side), dtype=still.dtype)
    padded[:crop.shape[0], :crop.shape[1]] = crop
    rgba = np.zeros((side, side, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 26, 22, 18
    rgba[..., 3] = (padded * 255).round().astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').resize((512, 512), Image.LANCZOS).save(
        OUT / 'still.webp', 'WEBP', quality=90, method=6)
    print(f"still: {(OUT / 'still.webp').stat().st_size / 1024:.0f} KB")

    (OUT / 'frames.json').write_text(json.dumps({'size': size, 'poses': manifest}, indent=2))
    if rejected:
        print('\nrejected:')
        for r in rejected:
            print('  ' + r)


if __name__ == '__main__':
    main()
