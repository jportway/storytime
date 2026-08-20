"""Shared image helpers for the owl pipeline.

The whole pipeline treats a sumi-e drawing as *ink density on paper* rather
than as pixels: alpha comes from how dark a pixel is relative to the paper
around it, never from a threshold. Thresholding is what destroys dry-brush
texture, and dry-brush texture is most of what makes it read as brushwork.
"""

from __future__ import annotations
import numpy as np
from PIL import Image


def load_rgb(path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def paper_level(lum: np.ndarray) -> float:
    """The paper's own brightness, measured from the border.

    Taken from the edges rather than the brightest pixel: a specular fleck or
    a JPEG artefact would otherwise define "paper" and wash the whole key out.
    """
    b = max(4, min(lum.shape) // 40)
    border = np.concatenate([
        lum[:b, :].ravel(), lum[-b:, :].ravel(),
        lum[:, :b].ravel(), lum[:, -b:].ravel(),
    ])
    return float(np.percentile(border, 60))


def ink_alpha(path, floor: float = 0.06, ink_level: float | None = None) -> np.ndarray:
    """Alpha from ink density: 0 where the paper shows, 1 at full black.

    `floor` discards the faintest signal, which on a photographed/JPEG paper
    is grain rather than brushwork. Everything above it is kept and rescaled,
    so a pale grey wash stays pale instead of snapping to opaque.
    """
    lum = luminance(load_rgb(path))
    paper = paper_level(lum)
    ink = float(np.percentile(lum, 0.5)) if ink_level is None else ink_level
    a = (paper - lum) / max(paper - ink, 1e-6)
    a = np.clip(a, 0.0, 1.0)
    a[a < floor] = 0.0
    a = np.clip((a - floor) / (1.0 - floor), 0.0, 1.0)
    return a


def alpha_to_rgba(alpha: np.ndarray, ink=(26, 22, 18)) -> Image.Image:
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = ink
    out[..., 3] = (alpha * 255).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def content_bbox(alpha: np.ndarray, frac: float = 0.004):
    """Bounding box of real ink.

    Measured from per-row/column ink *mass* rather than from any single dark
    pixel, so one stray speck of grain on an otherwise empty margin can't
    drag the box out to the edge of the paper — which is exactly what a
    naive min/max over the mask does on a photographed sheet.
    """
    if alpha.max() <= 0:
        return None
    col_mass = alpha.sum(axis=0)
    row_mass = alpha.sum(axis=1)
    cx = np.where(col_mass > col_mass.max() * frac)[0]
    ry = np.where(row_mass > row_mass.max() * frac)[0]
    if not len(cx) or not len(ry):
        return None
    return int(cx[0]), int(ry[0]), int(cx[-1]) + 1, int(ry[-1]) + 1
