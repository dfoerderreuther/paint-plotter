"""Paint wells and well layouts.

A well layout is a reusable arrangement of wells plus the painting area. It is plotted
with a pencil on paper so the physical wells can be placed on the outlines.

Default workflow: an A4 palette page lies in the corner diagonally opposite the painting
area. The pencil draws one cross per color on it, evenly spaced (see `arrange_palette`).

Well shapes:
- cross: a pencil cross on a palette paper. The paint is dabbed onto the cross and the
  brush picks it up at the centre. The label goes beside the cross, not under the paint.
- circle / rect: outline of a physical container (cup, pan) placed on the drawing.
"""

import json
import math
import re
from pathlib import Path
from typing import Literal

import numpy as np
import vpype as vp
from pydantic import BaseModel, Field
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import Polygon, box

from paint_plotter.config import PlotterConfig, data_dir
from paint_plotter.gcode import GcodeWriter

Point = tuple[float, float]


class Rect(BaseModel):
    """Axis-aligned rectangle, (x, y) = bottom left corner, mm."""

    x: float
    y: float
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)


class Well(BaseModel):
    id: str
    name: str
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    shape: Literal["cross", "circle", "rect"]
    # Centre of the well, mm.
    x: float
    y: float
    # Cross: width_mm is the arm length (= size of the paint spot). Circle: width_mm is the
    # diameter. height_mm is only used by rect.
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)


A4_MM = (210.0, 297.0)


class WellLayout(BaseModel):
    name: str = Field(min_length=1)
    painting_area: Rect
    # Separate sheet the paint crosses are drawn on (None = wells anywhere on the bed).
    palette: Rect | None = None
    # Minimum gap between wells, and between wells and the painting area.
    margin_mm: float = Field(default=5, ge=0)
    # Also draw the painting area outline and registration marks in the pencil file.
    draw_painting_area: bool = True
    wells: list[Well] = []


# ---------------------------------------------------------------- geometry


CIRCLE_SEGMENT_MM = 1.0


def well_shape(well: Well) -> Polygon:
    """Area the well occupies (for a cross: the paint spot around it)."""
    if well.shape in ("circle", "cross"):
        return ShapelyPoint(well.x, well.y).buffer(well.width_mm / 2, quad_segs=32)
    w, h = well.width_mm / 2, well.height_mm / 2
    return box(well.x - w, well.y - h, well.x + w, well.y + h)


def well_outlines(well: Well) -> list[list[Point]]:
    """Pencil lines that mark the well."""
    if well.shape == "cross":
        s = well.width_mm / 2
        return [[(well.x - s, well.y), (well.x + s, well.y)], [(well.x, well.y - s), (well.x, well.y + s)]]
    if well.shape == "circle":
        r = well.width_mm / 2
        n = max(24, math.ceil(2 * math.pi * r / CIRCLE_SEGMENT_MM))
        return [[(well.x + r * math.cos(2 * math.pi * i / n), well.y + r * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]]
    return [_rect_outline(well.x - well.width_mm / 2, well.y - well.height_mm / 2, well.width_mm, well.height_mm)]


def _rect_outline(x: float, y: float, w: float, h: float) -> list[Point]:
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]


def check_layout(layout: WellLayout, config: PlotterConfig) -> list[str]:
    """Problems with the layout, as human-readable warnings (empty = OK)."""
    warnings: list[str] = []
    bed = box(0, 0, config.work_area.width_mm, config.work_area.height_mm)
    pa = layout.painting_area
    area = box(pa.x, pa.y, pa.x + pa.width_mm, pa.y + pa.height_mm)
    if not bed.contains(area):
        warnings.append("Painting area is outside the work area")

    palette = None
    if layout.palette:
        p = layout.palette
        palette = box(p.x, p.y, p.x + p.width_mm, p.y + p.height_mm)
        if not bed.contains(palette):
            warnings.append("Palette page is outside the work area")
        if palette.intersects(area):
            warnings.append("Palette page overlaps the painting area")

    shapes = [(w, well_shape(w)) for w in layout.wells]
    for w, s in shapes:
        if not bed.contains(s):
            warnings.append(f"Well '{w.name}' is outside the work area")
        elif (lb := label_bounds(w)) and not bed.contains(box(*lb)):
            warnings.append(f"Label of well '{w.name}' is outside the work area")
        if palette is not None and not palette.contains(s):
            warnings.append(f"Well '{w.name}' is not on the palette page")
        if s.distance(area) < layout.margin_mm:
            warnings.append(f"Well '{w.name}' is closer than {layout.margin_mm:g} mm to the painting area")
    for i, (a, sa) in enumerate(shapes):
        for b, sb in shapes[i + 1 :]:
            if sa.distance(sb) < layout.margin_mm:
                warnings.append(f"Wells '{a.name}' and '{b.name}' are closer than {layout.margin_mm:g} mm")
    return warnings


# ---------------------------------------------------------------- pencil G-code


REGISTRATION_MARK_MM = 10
LABEL_SIZE_MM = (2.0, 6.0)  # min / max text size
CROSS_LABEL_SIZE_MM = 4.0
CROSS_LABEL_GAP_MM = 2.0


def _label(well: Well) -> list[list[Point]]:
    """Well name in a single-stroke font, Y up. Centred in containers, beside crosses."""
    if well.shape == "cross":
        size, align = CROSS_LABEL_SIZE_MM, "left"
        # Upper right of the cross, outside the paint spot.
        ox = well.x + well.width_mm / 2 + CROSS_LABEL_GAP_MM
        oy = well.y + well.width_mm / 2
    else:
        inner = well.width_mm if well.shape == "circle" else min(well.width_mm, well.height_mm)
        size, align = min(max(inner * 0.25, LABEL_SIZE_MM[0]), LABEL_SIZE_MM[1]), "center"
        ox, oy = well.x, well.y
    lc = vp.text_line(well.name, "futural", size=size, align=align)
    if len(lc) == 0:
        return []
    _, ymin, _, ymax = lc.bounds()
    dy = (ymin + ymax) / 2
    # vpype text is Y down: flip and centre vertically on (ox, oy).
    return [list(zip((line.real + ox).tolist(), (oy - (line.imag - dy)).tolist())) for line in lc]


def label_bounds(well: Well) -> tuple[float, float, float, float] | None:
    lines = _label(well)
    if not lines:
        return None
    xs = [x for line in lines for x, _ in line]
    ys = [y for line in lines for _, y in line]
    return min(xs), min(ys), max(xs), max(ys)


def _registration_marks(layout: WellLayout, config: PlotterConfig) -> list[list[Point]]:
    """A cross at each corner of the painting area, clipped to the work area."""
    pa = layout.painting_area
    s = REGISTRATION_MARK_MM / 2
    bed_w, bed_h = config.work_area.width_mm, config.work_area.height_mm
    marks = []
    for cx, cy in [(pa.x, pa.y), (pa.x + pa.width_mm, pa.y), (pa.x + pa.width_mm, pa.y + pa.height_mm), (pa.x, pa.y + pa.height_mm)]:
        h = (np.clip(cx - s, 0, bed_w), np.clip(cx + s, 0, bed_w))
        v = (np.clip(cy - s, 0, bed_h), np.clip(cy + s, 0, bed_h))
        if 0 <= cy <= bed_h and h[1] > h[0]:
            marks.append([(float(h[0]), cy), (float(h[1]), cy)])
        if 0 <= cx <= bed_w and v[1] > v[0]:
            marks.append([(cx, float(v[0])), (cx, float(v[1]))])
    return marks


def layout_gcode(layout: WellLayout, config: PlotterConfig) -> str:
    g = GcodeWriter(config, f"well layout '{layout.name}'", tool="pencil")
    if layout.draw_painting_area:
        pa = layout.painting_area
        g.comment("painting area")
        g.polyline(_rect_outline(pa.x, pa.y, pa.width_mm, pa.height_mm))
        g.comment("registration marks")
        g.polylines(_registration_marks(layout, config))
    for well in layout.wells:
        g.comment(f"well '{well.name}' {well.color}")
        g.polylines(well_outlines(well))
        g.polylines(_label(well))
    return g.finish()


# ---------------------------------------------------------------- palette arrangement


CROSS_SIZE_MM = 15.0


def arrange_palette(
    layout: WellLayout, colors: list[str], config: PlotterConfig, page_mm: tuple[float, float] = A4_MM
) -> WellLayout:
    """Put a palette page in the bed corner diagonally opposite the painting area and
    place one cross per color evenly on it. Returns a new layout."""
    bed_w, bed_h = config.work_area.width_mm, config.work_area.height_mm
    pa = layout.painting_area
    area = box(pa.x, pa.y, pa.x + pa.width_mm, pa.y + pa.height_mm)
    right = pa.x + pa.width_mm / 2 < bed_w / 2
    top = pa.y + pa.height_mm / 2 < bed_h / 2

    def page(w: float, h: float) -> Rect:
        return Rect(x=bed_w - w if right else 0, y=bed_h - h if top else 0, width_mm=w, height_mm=h)

    # Portrait unless only landscape stays clear of the painting area.
    pw, ph = page_mm
    candidates = [page(pw, ph), page(ph, pw)]
    palette = min(
        candidates, key=lambda r: box(r.x, r.y, r.x + r.width_mm, r.y + r.height_mm).intersection(area).area
    )

    n = len(colors)
    wells: list[Well] = []
    if n:
        cols = max(1, round(math.sqrt(n * palette.width_mm / palette.height_mm)))
        rows = math.ceil(n / cols)
        cols = math.ceil(n / rows)
        cw, ch = palette.width_mm / cols, palette.height_mm / rows
        size = min(CROSS_SIZE_MM, cw * 0.4, ch * 0.4)
        for i, color in enumerate(colors):
            r, c = divmod(i, cols)
            wells.append(
                Well(
                    id=f"w{i + 1}",
                    name=f"{i + 1} {color.lstrip('#')}",
                    color=color,
                    shape="cross",
                    # Cross left of the cell centre, leaving room for the label on its right.
                    x=round(palette.x + (c + 0.35) * cw, 2),
                    # Row 0 at the top of the page.
                    y=round(palette.y + palette.height_mm - (r + 0.5) * ch, 2),
                    width_mm=round(size, 2),
                    height_mm=round(size, 2),
                )
            )
    return layout.model_copy(update={"palette": palette, "wells": wells})


# ---------------------------------------------------------------- storage


def _layouts_dir() -> Path:
    d = data_dir() / "well_layouts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_name(name: str) -> str:
    """File-system safe version of a layout name."""
    s = re.sub(r"[^A-Za-z0-9_-]+", "_", name.strip()).strip("_")
    if not s:
        raise ValueError(f"Invalid layout name {name!r}")
    return s


def list_layouts() -> list[str]:
    return sorted(json.loads(p.read_text())["name"] for p in _layouts_dir().glob("*.json"))


def load_layout(name: str) -> WellLayout:
    path = _layouts_dir() / f"{safe_name(name)}.json"
    return WellLayout.model_validate_json(path.read_text())


def save_layout(layout: WellLayout) -> None:
    path = _layouts_dir() / f"{safe_name(layout.name)}.json"
    path.write_text(layout.model_dump_json(indent=2))


def delete_layout(name: str) -> None:
    (_layouts_dir() / f"{safe_name(name)}.json").unlink()
