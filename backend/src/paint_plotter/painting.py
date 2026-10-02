"""Turn the drawing's paint layers into brush G-code, one file per well.

Pipeline per well (= per paint / brush):
1. Collect the visible layers whose color is mapped to this well.
2. Fill layers → fill area (SVG nonzero-like nesting) → shrunk by half the brush width
   → optional outline + hatch lines. Stroke layers → their centre lines.
3. Split the strokes so the brush dips into the well every `paint_distance_mm`
   and continues exactly where it stopped.
4. Write the G-code (Marlin, Z up/down, ends parked).

Painting behaviors are options (see PaintSettings) so more fill patterns and dip
motions can be added later.
"""

import math
from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, Field
from shapely import affinity
from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from paint_plotter.config import PlotterConfig
from paint_plotter.gcode import GcodeWriter
from paint_plotter.svg_import import PaintLayer
from paint_plotter.wells import Well, WellLayout, safe_name

Point = tuple[float, float]
Polyline = list[Point]

FIRST_BRUSH_FILE_INDEX = 2  # 01 is the pencil layout file
SIMPLIFY_MM = 0.05  # max deviation when reducing points (fewer G-code lines)


# ---------------------------------------------------------------- settings


class FillSettings(BaseModel):
    # hatch: parallel lines at angle_deg. contour: outline, then step inwards ring by ring.
    pattern: Literal["hatch", "contour"] = "hatch"
    angle_deg: float = 45  # hatch only
    # Overlap of neighbouring hatch lines, as a fraction of the brush width.
    overlap: float = Field(default=0.2, ge=0, le=0.9)
    # Paint the area's outline before hatching it (gives a clean edge). Contour always starts
    # with the outline, so this only affects hatch.
    outline: bool = True


class DipSettings(BaseModel):
    # tap: down and up. circle: down, one circle in the paint, up.
    mode: Literal["tap", "circle"] = "tap"
    circle_radius_mm: float = Field(default=3, gt=0)
    # When a stroke continues after a dip, put the brush down this far back along the
    # already painted part and paint over it again (not counted as paint per dip).
    resume_overlap_mm: float = Field(default=0, ge=0)


class PaintSettings(BaseModel):
    brush_width_mm: float = Field(default=3, gt=0)
    # How far the brush paints on one dip before it needs fresh paint.
    paint_distance_mm: float = Field(default=150, gt=0)
    fill: FillSettings = FillSettings()
    dip: DipSettings = DipSettings()


class Placement(BaseModel):
    x: float = 0
    y: float = 0
    scale: float = Field(default=1, gt=0)


class PaintRequest(BaseModel):
    layers: list[PaintLayer]  # the layers to paint (the frontend sends only visible ones)
    placement: Placement
    layout: WellLayout
    # Drawing color → well id (None = don't paint).
    color_map: dict[str, str | None]
    settings: PaintSettings = PaintSettings()
    project_name: str | None = None  # names the export zip


class PaintFile(BaseModel):
    index: int
    filename: str
    well_id: str
    well_name: str
    well_color: str
    colors: list[str]  # drawing colors painted with this well
    dips: int
    paint_length_mm: float
    travel_length_mm: float
    estimated_seconds: float
    strokes: list[Polyline]  # brush-down paths, for the preview
    gcode: str


class PaintPlan(BaseModel):
    files: list[PaintFile]
    warnings: list[str]


# ---------------------------------------------------------------- geometry


def _place(path: list[tuple[float, float]], p: Placement) -> Polyline:
    return [(p.x + x * p.scale, p.y + y * p.scale) for x, y in path]


def fill_area(paths: list[Polyline]) -> BaseGeometry:
    """Area covered by closed paths, nonzero-like: rings nested an odd number of times are holes.

    vpype splits compound paths (e.g. the letter O) into separate rings, so holes are
    recovered from how deeply each ring is nested in the others.
    """
    polys = []
    for path in paths:
        if len(path) >= 3:
            poly = Polygon(path).buffer(0)
            if not poly.is_empty and poly.area > 1e-9:
                polys.append(poly)
    depth = []
    for i, p in enumerate(polys):
        point = p.representative_point()
        depth.append(sum(1 for j, q in enumerate(polys) if j != i and q.area > p.area and q.contains(point)))
    area: BaseGeometry = Polygon()
    for d in sorted(set(depth)):
        level = unary_union([p for p, pd in zip(polys, depth) if pd == d])
        area = area.union(level) if d % 2 == 0 else area.difference(level)
    return area


def _lines_of(geom: BaseGeometry) -> list[LineString]:
    if isinstance(geom, LineString):
        return [geom] if geom.length > 0 else []
    if isinstance(geom, (MultiLineString, GeometryCollection)):
        return [g for part in geom.geoms for g in _lines_of(part)]
    return []


def _polygons_of(geom: BaseGeometry) -> list[Polygon]:
    if isinstance(geom, Polygon):
        return [geom] if not geom.is_empty else []
    if isinstance(geom, (MultiPolygon, GeometryCollection)):
        return [g for part in geom.geoms for g in _polygons_of(part)]
    return []


def outlines(area: BaseGeometry) -> list[Polyline]:
    rings = []
    for poly in _polygons_of(area):
        rings.append(list(poly.exterior.coords))
        rings.extend(list(r.coords) for r in poly.interiors)
    return rings


def hatch(area: BaseGeometry, spacing: float, angle_deg: float) -> list[Polyline]:
    """Parallel lines across the area, in zig-zag order; neighbouring lines are joined into
    one stroke where the connection stays inside the area (fewer brush lifts)."""
    if area.is_empty:
        return []
    rotated = affinity.rotate(area, -angle_deg, origin=(0, 0))
    minx, miny, maxx, maxy = rotated.bounds
    rows: list[list[LineString]] = []
    y = miny + spacing / 2
    while y < maxy:
        segs = _lines_of(LineString([(minx - 1, y), (maxx + 1, y)]).intersection(rotated))
        segs.sort(key=lambda s: min(s.coords[0][0], s.coords[-1][0]))
        if len(rows) % 2:
            segs = [LineString(list(s.coords)[::-1]) for s in reversed(segs)]
        else:
            segs = [s if s.coords[0][0] <= s.coords[-1][0] else LineString(list(s.coords)[::-1]) for s in segs]
        rows.append(segs)
        y += spacing

    inside = rotated.buffer(spacing * 0.01 + 1e-6)
    result: list[Polyline] = []
    for seg in (s for row in rows for s in row):
        pts = list(seg.coords)
        if result:
            end = result[-1][-1]
            if math.dist(end, pts[0]) <= 2.5 * spacing and LineString([end, pts[0]]).within(inside):
                result[-1].extend(pts)
                continue
        result.append(pts)
    return [list(affinity.rotate(LineString(p), angle_deg, origin=(0, 0)).coords) for p in result]


def _ring_from(ring: Polyline, pos: Point) -> Polyline:
    """Closed ring rotated to start (and end) at its vertex nearest to `pos`."""
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    k = min(range(len(pts)), key=lambda i: math.dist(pts[i], pos))
    return pts[k:] + pts[:k] + [pts[k]]


def contour(area: BaseGeometry, spacing: float, brush_radius: float, start: Point) -> list[Polyline]:
    """Outline of the area, then the outline shrunk by `spacing`, and so on until nothing is
    left. Each ring starts near where the previous one ended and is joined to it when the
    connection is short and stays inside the area (gives a near-continuous spiral)."""
    if area.is_empty:
        return []
    inside = area.buffer(spacing * 0.01 + 1e-6)
    result: list[Polyline] = []
    pos = start

    def paint_level(level: BaseGeometry) -> None:
        nonlocal pos
        rings = outlines(level)
        # Nearest ring first within this level.
        while rings:
            i = min(range(len(rings)), key=lambda j: min(math.dist(pos, p) for p in rings[j]))
            ring = _ring_from(rings.pop(i), pos)
            if result and math.dist(pos, ring[0]) <= 2.5 * spacing and LineString([pos, ring[0]]).within(inside):
                result[-1].extend(ring)
            else:
                result.append(ring)
            pos = ring[-1]

    current, last = area, area
    while not current.is_empty:
        paint_level(current)
        last = current
        current = current.buffer(-spacing, join_style="mitre", mitre_limit=2)
    # The last ring paints `brush_radius` inwards; if its inside is wider, one more ring
    # half a brush further in closes the gap in the middle.
    leftover = last.buffer(-brush_radius, join_style="mitre", mitre_limit=2)
    if not leftover.is_empty and leftover.area > 1e-6:
        paint_level(leftover)
    return result


def order_nearest(paths: list[Polyline], start: Point) -> list[Polyline]:
    """Greedy nearest-neighbour ordering; paths may be reversed."""
    remaining = [p for p in paths if len(p) >= 2]
    ordered: list[Polyline] = []
    pos = start
    while remaining:
        best_i, best_rev, best_d = 0, False, math.inf
        for i, p in enumerate(remaining):
            d0, d1 = math.dist(pos, p[0]), math.dist(pos, p[-1])
            if d0 < best_d:
                best_i, best_rev, best_d = i, False, d0
            if d1 < best_d:
                best_i, best_rev, best_d = i, True, d1
        p = remaining.pop(best_i)
        p = p[::-1] if best_rev else p
        ordered.append(p)
        pos = p[-1]
    return ordered


Event = tuple[Literal["dip"], None] | tuple[Literal["stroke"], Polyline]


def _tail(path: Polyline, length: float) -> Polyline:
    """The last `length` mm of `path` (the whole path if it is shorter)."""
    out = [path[-1]]
    for a, b in zip(reversed(path[:-1]), reversed(path[1:])):  # segments a→b, from the end
        seg = math.dist(a, b)
        if seg >= length:
            t = length / seg if seg else 0
            out.append((b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t))
            break
        out.append(a)
        length -= seg
    return out[::-1]


def split_by_paint(strokes: list[Polyline], paint_distance: float, resume_overlap: float = 0) -> Iterator[Event]:
    """Dip first, then paint; dip again whenever `paint_distance` mm have been painted.
    A cut stroke continues where it was cut, or `resume_overlap` mm before that (never
    before the start of the stroke); the overlap is not counted as painted distance."""
    yield ("dip", None)
    left = paint_distance
    for stroke in strokes:
        piece: Polyline = [stroke[0]]
        walked: Polyline = [stroke[0]]  # the stroke up to the current point
        for a, b in zip(stroke, stroke[1:]):
            seg = math.dist(a, b)
            start = a
            while seg > left:
                t = left / seg
                cut = (start[0] + (b[0] - start[0]) * t, start[1] + (b[1] - start[1]) * t)
                piece.append(cut)
                walked.append(cut)
                yield ("stroke", piece)
                yield ("dip", None)
                seg -= left
                left = paint_distance
                start = cut
                piece = _tail(walked, resume_overlap) if resume_overlap > 0 else [cut]
            piece.append(b)
            walked.append(b)
            left -= seg
        if len(piece) >= 2:
            yield ("stroke", piece)


# ---------------------------------------------------------------- G-code


def _dip(g: GcodeWriter, well: Well, dip: DipSettings) -> None:
    g.comment(f"dip into '{well.name}'")
    if dip.mode == "circle":
        r = dip.circle_radius_mm
        n = max(12, math.ceil(2 * math.pi * r))
        circle = [(well.x + r * math.cos(2 * math.pi * i / n), well.y + r * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]
        g.polyline([(well.x, well.y), *circle, (well.x, well.y)])
    else:
        g.travel(well.x, well.y)
        g.down()
        g.up()


def _simplify(path: Polyline) -> Polyline:
    if len(path) <= 2:
        return path
    return list(LineString(path).simplify(SIMPLIFY_MM, preserve_topology=False).coords)


def _round(path: Polyline) -> Polyline:
    return [(round(x, 2), round(y, 2)) for x, y in path]


def plan_painting(req: PaintRequest, config: PlotterConfig) -> PaintPlan:
    s = req.settings
    warnings: list[str] = []
    wells = {w.id: w for w in req.layout.wells}

    # Group layers by well, in drawing order of first appearance.
    groups: dict[str, list[PaintLayer]] = {}
    for layer in req.layers:
        well_id = req.color_map.get(layer.color)
        if well_id is None:
            continue
        if well_id not in wells:
            warnings.append(f"Color {layer.color} is mapped to a well that does not exist; skipped")
            continue
        groups.setdefault(well_id, []).append(layer)
        if layer.kind == "stroke" and (layer.stroke_width_mm or 0) * req.placement.scale > s.brush_width_mm * 1.5:
            warnings.append(
                f"Line {layer.color} is {layer.stroke_width_mm * req.placement.scale:.1f} mm wide on the bed, "
                f"the brush only {s.brush_width_mm:g} mm"
            )

    spacing = s.brush_width_mm * (1 - s.fill.overlap)
    files: list[PaintFile] = []
    for n, (well_id, layers) in enumerate(groups.items()):
        well = wells[well_id]
        outline_strokes: list[Polyline] = []
        fill_strokes: list[Polyline] = []
        line_strokes: list[Polyline] = []
        for layer in layers:
            paths = [_place(p, req.placement) for p in layer.paths]
            if layer.kind == "stroke":
                line_strokes.extend(paths)
                continue
            area = fill_area(paths)
            inset = area.buffer(-s.brush_width_mm / 2)
            if inset.is_empty:
                # Thinner than the brush: at least paint along its edge.
                outline_strokes.extend(outlines(area))
                continue
            if s.fill.pattern == "contour":
                start = fill_strokes[-1][-1] if fill_strokes else (well.x, well.y)
                fill_strokes.extend(contour(inset, spacing, s.brush_width_mm / 2, start))
                continue
            if s.fill.outline:
                outline_strokes.extend(outlines(inset))
            fill_strokes.extend(hatch(inset, spacing, s.fill.angle_deg))

        # Outlines (hatch only) first, then the fill, then lines on top.
        strokes = order_nearest(outline_strokes, (well.x, well.y))
        pos = strokes[-1][-1] if strokes else (well.x, well.y)
        strokes += fill_strokes
        pos = strokes[-1][-1] if strokes else pos
        strokes += order_nearest(line_strokes, pos)
        strokes = [_simplify(st) for st in strokes]

        index = FIRST_BRUSH_FILE_INDEX + n
        colors = list(dict.fromkeys(layer.color for layer in layers))
        g = GcodeWriter(config, f"paint with '{well.name}' {well.color}", tool=f"brush {s.brush_width_mm:g} mm")
        g.comment(f"drawing colors: {', '.join(colors)}")
        dips = 0
        painted: list[Polyline] = []
        for kind, piece in split_by_paint(strokes, s.paint_distance_mm, s.dip.resume_overlap_mm):
            if kind == "dip":
                _dip(g, well, s.dip)
                dips += 1
            else:
                g.polyline(piece)
                painted.append(_round(piece))
        gcode = g.finish()
        files.append(
            PaintFile(
                index=index,
                filename=f"{index:02d}_{safe_name(well.name)}_brush.gcode",
                well_id=well.id,
                well_name=well.name,
                well_color=well.color,
                colors=colors,
                dips=dips,
                paint_length_mm=round(g.paint_mm, 1),
                travel_length_mm=round(g.travel_mm, 1),
                estimated_seconds=round(g.estimated_seconds()),
                strokes=painted,
                gcode=gcode,
            )
        )

    unmapped = [c for c in dict.fromkeys(l.color for l in req.layers) if req.color_map.get(c) is None]
    if unmapped:
        warnings.append(f"Not painted (no well): {', '.join(unmapped)}")
    return PaintPlan(files=files, warnings=list(dict.fromkeys(warnings)))


def steps_text(plan: PaintPlan, layout: WellLayout, pencil_file: str | None) -> str:
    """Human instructions for running the files in order (goes into the zip)."""
    lines = ["Paint Plotter - run the files in this order with CNCjs", ""]
    if pencil_file:
        lines += [
            f"{pencil_file}",
            "  - Lay the palette sheet on the bed and insert the PENCIL.",
            "  - Run the file. It draws the paint crosses and labels.",
            "",
        ]
    for f in plan.files:
        lines += [
            f"{f.filename}",
            f"  - Insert a clean BRUSH.",
            f"  - Put paint {f.well_color} on cross '{f.well_name}' (drawing colors: {', '.join(f.colors)}).",
            f"  - Run the file. {f.dips} dips, about {math.ceil(f.estimated_seconds / 60)} min.",
            "",
        ]
    return "\n".join(lines)

