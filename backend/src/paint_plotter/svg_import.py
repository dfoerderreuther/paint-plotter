"""Read an SVG with vpype and split it into paint layers by color and kind (fill / stroke).

Output coordinates are in mm with the origin at the bottom left of the SVG page and
Y pointing up, i.e. the plotter's convention. Placement on the bed happens later.
"""

from typing import IO, Literal

import numpy as np
import vpype as vp
from pydantic import BaseModel

MM = vp.convert_length("mm")  # CSS px per mm (vpype works in px)
QUANTIZATION_MM = 0.1  # max segment length when flattening curves

Kind = Literal["fill", "stroke"]


class PaintLayer(BaseModel):
    id: str
    kind: Kind
    color: str  # "#rrggbb"
    stroke_width_mm: float | None = None  # only for kind == "stroke"
    paths: list[list[tuple[float, float]]]
    length_mm: float


class SvgDrawing(BaseModel):
    width_mm: float
    height_mm: float
    layers: list[PaintLayer]
    warnings: list[str]


def _parse_color(value: str | None, attr: str, warnings: list[str]) -> str | None:
    """Return "#rrggbb", or None if nothing is painted. vpype maps unknown values to black."""
    if value is None:
        return None
    value = value.strip()
    if value == "none" or value == "transparent":
        return None
    if value.startswith("url(") or value in ("currentColor", "inherit"):
        warnings.append(f"Unsupported {attr} value {value!r} (gradient/pattern/currentColor) ignored")
        return None
    try:
        return vp.Color(value).as_hex()[:7]
    except ValueError:
        warnings.append(f"Unknown {attr} color {value!r} ignored")
        return None


def read_svg(file: IO[str]) -> SvgDrawing:
    doc = vp.read_svg_by_attributes(file, ["fill", "stroke", "stroke-width"], quantization=QUANTIZATION_MM * MM)
    width_px, height_px = doc.page_size
    height_mm = height_px / MM
    warnings: list[str] = []

    # Merge vpype layers with the same (kind, color, width) in order of first appearance.
    layers: dict[str, PaintLayer] = {}

    def add(kind: Kind, color: str, lines: vp.LineCollection, stroke_width_mm: float | None = None) -> None:
        key = f"{kind}-{color}" + (f"-{stroke_width_mm:g}" if stroke_width_mm is not None else "")
        paths = [_to_plotter_coords(line, height_mm) for line in lines]
        length = float(lines.length()) / MM
        if key in layers:
            layers[key].paths.extend(paths)
            layers[key].length_mm += length
        else:
            layers[key] = PaintLayer(
                id=key, kind=kind, color=color, stroke_width_mm=stroke_width_mm, paths=paths, length_mm=length
            )

    for lines in doc.layers.values():
        meta = lines.metadata
        # SVG defaults: fill is black, stroke is none.
        fill = _parse_color(meta.get("svg_fill", "black"), "fill", warnings)
        stroke = _parse_color(meta.get("svg_stroke"), "stroke", warnings)
        if fill:
            add("fill", fill, lines)
        if stroke:
            add("stroke", stroke, lines, round(meta.get("vp_pen_width", MM) / MM, 3))

    for layer in layers.values():
        layer.length_mm = round(layer.length_mm, 1)

    return SvgDrawing(
        width_mm=round(width_px / MM, 3),
        height_mm=round(height_mm, 3),
        layers=list(layers.values()),
        warnings=sorted(set(warnings)),
    )


def _to_plotter_coords(line: np.ndarray, height_mm: float) -> list[tuple[float, float]]:
    """vpype line (complex px, Y down) → [(x, y)] in mm, Y up from the page bottom."""
    x = np.round(line.real / MM, 2)
    y = np.round(height_mm - line.imag / MM, 2)
    return list(zip(x.tolist(), y.tolist()))
