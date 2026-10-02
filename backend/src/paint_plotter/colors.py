"""Color matching between drawing colors and paint wells.

Distances are CIE76 ΔE in CIELAB (D65), which is close enough to how different two colors
look for picking a paint: < 2.3 is barely noticeable, > ~25 is a clearly different color.
"""

from pydantic import BaseModel

from paint_plotter.wells import Well


def hex_to_lab(color: str) -> tuple[float, float, float]:
    h = color.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB → linear
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    r, g, b = lin
    # linear sRGB → XYZ (D65), normalised by the white point
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a: str, b: str) -> float:
    la, lb = hex_to_lab(a), hex_to_lab(b)
    return sum((p - q) ** 2 for p, q in zip(la, lb)) ** 0.5


class ColorMatch(BaseModel):
    color: str
    # Closest well, or None if there are no wells.
    best_well_id: str | None
    # ΔE from this color to every well, by well id.
    distances: dict[str, float]


def match_colors(colors: list[str], wells: list[Well]) -> list[ColorMatch]:
    result = []
    for color in colors:
        distances = {w.id: round(delta_e(color, w.color), 1) for w in wells}
        best = min(distances, key=distances.__getitem__) if distances else None
        result.append(ColorMatch(color=color, best_well_id=best, distances=distances))
    return result
