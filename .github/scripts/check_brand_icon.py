#!/usr/bin/env python3
"""Check a carrier repo's brand/icon.png against the Home Assistant brands spec.

    python check_brand_icon.py                 # DOMAIN env, or .github/suite.json
    python check_brand_icon.py path/to/icon.png

HACS reads ``custom_components/<domain>/brand/icon.png`` straight out of the
repo, and the docs site republishes that same byte-for-byte file as the carrier
tile. One bad export therefore lands in two user-facing places at once, and
neither HACS nor hassfest looks at the pixels. This does.

The rules encode https://github.com/home-assistant/brands ("Image
specification"), minus the one rule that does not survive contact with this
suite: "trimmed, minimum empty space". Measured across all 59 icons, ~50 are a
logo centred on a full-bleed brand-colour plate with 10-40% padding -- that IS
the suite's tile style and the spec's trim rule would condemn nearly all of it.
So padding is not checked; what is checked is the artwork lying about its own
edges.

Checked:

size            Exactly 256x256 (512x512 for an ``icon@2x.png``). Hard spec.
corner-fill     An opaque colour packed into all four corners that is not the
                plate the edges show -- a rounded app-icon screenshot crushed
                onto an opaque backdrop. It reads as four coloured wedges.
                Rounded corners themselves are fine; the corners must then be
                TRANSPARENT, which is how HA composites them on any theme.
corner-alpha    All four corners transparent or none. Half-rounded is an export
                accident, never a design.
margin          A uniform band of one colour ringing the whole icon before the
                artwork starts -- a baked-in border or letterbox. This is the
                one trim case that is unambiguous, because the band's inner
                edge is a hard rectangle, not padding that fades into a plate.
blur            Artwork upscaled from a small source. Measured as edge-ramp
                width: flat vector-ish marks land at 1.4-4.3, an upscaled
                bitmap at 18+. The gap is wide enough to gate on.

Requires Pillow. Imported by tools/icon_audit.py, which sweeps every repo at
once; this file stays the single definition of the rules.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageFilter

SPEC = "https://github.com/home-assistant/brands#image-specification"

# Sum of absolute RGBA channel differences, so 0-1020. A "sharp" step is any
# transition a viewer would read as an edge rather than a gradient; 90 sits
# well above the per-pixel delta of every gradient plate in the suite.
SHARP = 90
# Two colours count as the same plate below this. Covers JPEG-ish ringing and
# the 1-2 unit drift of a subtle gradient, without merging brand colours.
SAME = 40
# A corner fill never reaches further along the diagonal than this.
CORNER_LIMIT = 0.18
# Edge-ramp width above which artwork is an upscaled bitmap. Highest real
# vector icon in the suite measures 4.3; the one upscaled icon measured 18.4.
BLUR_RAMP = 8.0


def _d(a: tuple[int, ...], b: tuple[int, ...]) -> int:
    return sum(abs(x - y) for x, y in zip(a, b))


def _ring(px, w: int, h: int, k: int) -> list[tuple[int, ...]]:
    """The one-pixel rectangle inset ``k`` pixels from the image edge."""
    x0, y0, x1, y1 = k, k, w - 1 - k, h - 1 - k
    return (
        [px[x, y0] for x in range(x0, x1 + 1)]
        + [px[x, y1] for x in range(x0, x1 + 1)]
        + [px[x0, y] for y in range(y0, y1 + 1)]
        + [px[x1, y] for y in range(y0, y1 + 1)]
    )


def _corners(w: int, h: int) -> list[tuple[int, int]]:
    return [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]


def _corner_break(px, w: int, h: int, corner: tuple[int, int]) -> float | None:
    """Walk the diagonal inward; return where the colour first steps sharply.

    A gradient never steps, so a plate that simply shades from one corner to
    another reports nothing here. Returned as a fraction of the icon's side.
    """
    cx, cy = corner
    sx = 1 if cx == 0 else -1
    sy = 1 if cy == 0 else -1
    prev = px[cx, cy]
    for i in range(1, int(min(w, h) * CORNER_LIMIT)):
        cur = px[cx + sx * i, cy + sy * i]
        if _d(cur, prev) > SHARP:
            return i / min(w, h)
        prev = cur
    return None


def _plate(px, w: int, h: int) -> tuple[int, ...]:
    """The icon's own edge colour: the modal colour of its border ring.

    Compared against the corners rather than the edge midpoints, because a
    backdrop is not always flat -- one icon in the suite carries a dark
    vignette whose midpoints drift far enough to hide the corners behind it.
    """
    return Counter(_ring(px, w, h, 0)).most_common(1)[0][0]


def check_corner_fill(im: Image.Image) -> list[str]:
    """All four corners holding one opaque colour the edges do not show."""
    w, h = im.size
    px = im.load()
    cols = [px[x, y] for x, y in _corners(w, h)]
    if any(c[3] == 0 for c in cols):
        return []
    if max(_d(cols[0], c) for c in cols) > SAME:
        return []  # four different corners is artwork, not a fill
    breaks = [_corner_break(px, w, h, c) for c in _corners(w, h)]
    if any(b is None for b in breaks):
        return []
    # The fill must be foreign to the icon's own edge colour. A full-bleed
    # white plate whose artwork happens to be symmetric (a rotated label
    # reaching the corners) shows that SAME white on the ring, and is left
    # alone. A gradient plate is safe for a different reason: it never steps,
    # so _corner_break already returned None above.
    if _d(cols[0], _plate(px, w, h)) > SHARP:
        message = (
            f"corner-fill: all four corners are opaque rgb{cols[0][:3]}, a "
            f"colour the edges do not show -- rounded artwork flattened onto "
            f"a backdrop. Rounded corners are fine, but they must be "
            f"transparent."
        )
        return [message]
    return []


def check_corner_alpha(im: Image.Image) -> list[str]:
    """Rounded on some corners but not others."""
    w, h = im.size
    px = im.load()
    alphas = [px[x, y][3] for x, y in _corners(w, h)]
    if min(alphas) == 0 and max(alphas) > 0:
        message = (
            f"corner-alpha: corners are a mix of transparent and opaque "
            f"(alpha {alphas}) -- round all four or none."
        )
        return [message]
    return []


def check_margin(im: Image.Image) -> list[str]:
    """A uniform band of one colour ringing the icon before the artwork."""
    w, h = im.size
    px = im.load()
    outer = _ring(px, w, h, 0)
    base, _ = Counter(outer).most_common(1)[0]
    if sum(1 for p in outer if _d(p, base) <= SAME) / len(outer) < 0.95:
        return []
    for k in range(1, int(min(w, h) * 0.10)):
        inner = _ring(px, w, h, k)
        if sum(1 for p in inner if _d(p, base) > SHARP) / len(inner) >= 0.90:
            kind = "transparent" if base[3] == 0 else f"rgb{base[:3]}"
            message = (
                f"margin: a {k}px {kind} band rings the whole icon before the "
                f"artwork starts -- a baked-in border or letterbox. Crop it "
                f"so the artwork reaches the edge."
            )
            return [message]
    return []


def check_blur(im: Image.Image) -> list[str]:
    """Artwork upscaled from a source too small to carry 256px of detail."""
    edges = im.convert("L").filter(ImageFilter.FIND_EDGES)
    data = list(edges.tobytes())  # "L" mode: one byte per pixel
    peak = sorted(data)[int(len(data) * 0.999)]
    if peak < 20:
        return []
    strong = sum(1 for p in data if p > peak * 0.5)
    weak = sum(1 for p in data if p > peak * 0.12)
    ramp = weak / max(strong, 1)
    if ramp > BLUR_RAMP:
        message = (
            f"blur: edges ramp over {ramp:.1f}x their core width, so this was "
            f"upscaled from a much smaller source. Resampling cannot fix it "
            f"-- it needs a higher-resolution original."
        )
        return [message]
    return []


def check_icon(path: Path) -> list[str]:
    """Every rule, for one icon file. Returns human-readable failures."""
    if not path.is_file():
        return [f"missing: {path} does not exist"]
    try:
        im = Image.open(path)
        im.load()
    except Exception as err:  # noqa: BLE001 - any decode failure is one failure
        return [f"unreadable: {path} is not a usable PNG ({err})"]
    if im.format != "PNG":
        return [f"format: {path} is {im.format}, must be PNG"]

    want = 512 if path.name == "icon@2x.png" else 256
    problems = []
    if im.size != (want, want):
        problems.append(
            f"size: {im.size[0]}x{im.size[1]}, must be exactly {want}x{want}"
        )

    im = im.convert("RGBA")
    for rule in (check_corner_fill, check_corner_alpha, check_margin, check_blur):
        problems.extend(rule(im))
    return problems


def _brand_dir() -> Path:
    root = Path.cwd()
    domain = os.environ.get("DOMAIN")
    if not domain:
        suite = json.loads((root / ".github" / "suite.json").read_text())
        domain = suite["domain"]
    return root / "custom_components" / domain / "brand"


def main(argv: list[str]) -> int:
    """Check the icons named on the command line, or this repo's own."""
    if argv:
        targets = [Path(a) for a in argv]
    else:
        brand = _brand_dir()
        targets = [brand / "icon.png"]
        if (retina := brand / "icon@2x.png").is_file():
            targets.append(retina)

    failures = 0
    for target in targets:
        for problem in check_icon(target):
            print(f"ERROR: {target}: {problem}")
            failures += 1
    if failures:
        print(f"\n{failures} brand icon problem(s). Spec: {SPEC}")
        return 1
    print(f"Brand icon checks passed ({', '.join(t.name for t in targets)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
