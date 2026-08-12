#!/usr/bin/env python3
"""
Generates the raster brand assets from the same tokens the CSS uses.

The mark is the bento itself: one tall cell beside two stacked ones. It reads
as an abstract geometric mark at 16px, which a wordmark never does, and it
stays recognisably the same object at 1200px.

Run after changing the accent token:

    pip install pillow fonttools brotli
    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import io
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
FONT_WOFF2 = STATIC / "fonts" / "inter-latin.woff2"


# --- OKLCH -> sRGB ----------------------------------------------------------
# The design tokens are authored in OKLCH, so the icons convert from the same
# values rather than carrying a second, drifting set of hex codes.

def oklch_to_srgb(L: float, C: float, H: float) -> tuple[int, int, int]:
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b

    l, m, s = l_**3, m_**3, s_**3

    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(u: float) -> int:
        u = max(0.0, min(1.0, u))
        u = 1.055 * (u ** (1 / 2.4)) - 0.055 if u > 0.0031308 else 12.92 * u
        return round(u * 255)

    return gamma(r), gamma(g), gamma(bl)


ACCENT = oklch_to_srgb(0.53, 0.156, 262)
INK = oklch_to_srgb(0.163, 0.008, 265)
PAPER = oklch_to_srgb(0.968, 0.003, 265)
MUTED = oklch_to_srgb(0.712, 0.011, 265)


def load_font(size: int, weight: float) -> ImageFont.FreeTypeFont:
    variable = TTFont(FONT_WOFF2)
    static = instancer.instantiateVariableFont(variable, {"wght": weight, "opsz": 32})
    buffer = io.BytesIO()
    static.save(buffer)
    buffer.seek(0)
    return ImageFont.truetype(buffer, size)


def draw_mark(draw: ImageDraw.ImageDraw, x: float, y: float, size: float, fill) -> None:
    """One tall cell, two stacked. The proportions match the `2x2`/`1x1` spans."""
    unit = size * 0.4062
    gap = size * 0.0938
    radius = size * 0.1094

    draw.rounded_rectangle([x, y, x + unit, y + size], radius=radius, fill=fill)
    draw.rounded_rectangle(
        [x + unit + gap, y, x + size, y + unit], radius=radius, fill=fill
    )
    draw.rounded_rectangle(
        [x + unit + gap, y + size - unit, x + size, y + size], radius=radius, fill=fill
    )


def tile(px: int) -> Image.Image:
    """The mark on an accent tile, drawn at 4x and downsampled for clean edges."""
    scale = 4
    size = px * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=ACCENT)
    inset = size * 0.26
    draw_mark(draw, inset, inset, size - inset * 2, (255, 255, 255, 255))

    return image.resize((px, px), Image.LANCZOS)


def write_og(title: str = "ij5.dev", tagline: str = "Links, writing and work.") -> None:
    """
    1200x630, drawn at 2x. A deliberate asset rather than a screenshot: this
    card is seen more often than the page it points at.

    The stack is left-aligned and optically centred as one group — mark,
    wordmark, tagline — so the composition holds at the thumbnail size most
    clients actually render.
    """
    scale = 2
    w, h = 1200 * scale, 630 * scale
    image = Image.new("RGB", (w, h), INK)
    draw = ImageDraw.Draw(image)

    margin = 88 * scale
    mark_size = 84 * scale
    title_size = 104 * scale
    tagline_size = 32 * scale

    # The accent lightens in dark mode, and this card is dark.
    accent = oklch_to_srgb(0.72, 0.142, 262)

    title_font = load_font(title_size, 620)
    tagline_font = load_font(tagline_size, 420)

    # Measure rather than guess: the descender in "j" is exactly what made a
    # hardcoded offset collide with the line below it.
    title_box = draw.textbbox((0, 0), title, font=title_font, anchor="ls")
    tagline_box = draw.textbbox((0, 0), tagline, font=tagline_font, anchor="ls")

    title_cap = -title_box[1]
    title_descent = title_box[3]
    tagline_cap = -tagline_box[1]

    gap_mark = 52 * scale
    gap_type = 26 * scale

    total = mark_size + gap_mark + title_cap + title_descent + gap_type + tagline_cap
    top = (h - total) / 2

    draw_mark(draw, margin, top, mark_size, accent)

    title_baseline = top + mark_size + gap_mark + title_cap
    draw.text((margin, title_baseline), title, font=title_font, fill=PAPER, anchor="ls")

    tagline_baseline = title_baseline + title_descent + gap_type + tagline_cap
    draw.text(
        (margin, tagline_baseline), tagline, font=tagline_font, fill=MUTED, anchor="ls"
    )

    image.resize((1200, 630), Image.LANCZOS).save(STATIC / "og.png", optimize=True)


def write_svg() -> None:
    """The scalable primary. Every other raster here is a fallback for it."""
    accent = "#%02x%02x%02x" % ACCENT
    STATIC.joinpath("icon.svg").write_text(
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ij5">
  <rect width="64" height="64" rx="14" fill="{accent}"/>
  <g fill="#fff">
    <rect x="16.6" y="16.6" width="12.5" height="30.8" rx="3.4"/>
    <rect x="34.9" y="16.6" width="12.5" height="12.5" rx="3.4"/>
    <rect x="34.9" y="34.9" width="12.5" height="12.5" rx="3.4"/>
  </g>
</svg>
""",
        encoding="utf-8",
    )


def main() -> None:
    write_svg()
    tile(180).save(STATIC / "apple-touch-icon.png", optimize=True)
    tile(512).save(STATIC / "icon-512.png", optimize=True)
    tile(192).save(STATIC / "icon-192.png", optimize=True)
    tile(64).save(
        STATIC / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
        format="ICO",
    )
    write_og()
    print("wrote icon.svg, favicon.ico, apple-touch-icon.png, icon-192/512.png, og.png")


if __name__ == "__main__":
    main()
