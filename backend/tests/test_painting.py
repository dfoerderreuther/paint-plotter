import io
import math
import random
import re
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import LineString, Polygon
from shapely.geometry import Point as Point_
from shapely.ops import unary_union

from paint_plotter.config import load_config
from paint_plotter.main import app
from paint_plotter.painting import (
    DipSettings,
    FillSettings,
    contour,
    dots,
    fill_gaps,
    PaintRequest,
    PaintSettings,
    Placement,
    fill_area,
    hatch,
    plan_painting,
    split_by_paint,
)
from paint_plotter.svg_import import read_svg
from paint_plotter.wells import Rect, WellLayout, arrange_palette

CONFIG = load_config()
SAMPLE = Path(__file__).parent / "data" / "sample.svg"


def square(x, y, s, reverse=False):
    pts = [(x, y), (x + s, y), (x + s, y + s), (x, y + s), (x, y)]
    return pts[::-1] if reverse else pts


def length(path):
    return sum(math.dist(a, b) for a, b in zip(path, path[1:]))


# ---------------------------------------------------------------- fill area


def test_nested_ring_is_a_hole():
    area = fill_area([square(0, 0, 10), square(3, 3, 4, reverse=True)])
    assert area.area == pytest.approx(100 - 16)


def test_island_inside_hole_is_filled_again():
    area = fill_area([square(0, 0, 10), square(2, 2, 6), square(4, 4, 2)])
    assert area.area == pytest.approx(100 - 36 + 4)


def test_overlapping_separate_shapes_are_united():
    area = fill_area([square(0, 0, 10), square(5, 5, 10)])
    assert area.area == pytest.approx(175)


# ---------------------------------------------------------------- hatch


def test_hatch_square_is_one_zigzag_inside_the_area():
    area = Polygon(square(0, 0, 10))
    lines = hatch(area, spacing=2, angle_deg=0)
    assert len(lines) == 1  # joined into one stroke
    ys = sorted({round(y, 6) for _, y in lines[0]})
    assert ys == [1, 3, 5, 7, 9]
    assert LineString(lines[0]).within(area.buffer(1e-6))


def test_hatch_does_not_join_across_a_hole():
    area = Polygon(square(0, 0, 10)).difference(Polygon(square(3, 0, 4)))  # U shape, open at the bottom
    for line in hatch(area, spacing=1, angle_deg=0):
        assert LineString(line).within(area.buffer(1e-3))


def test_hatch_angle():
    lines = hatch(Polygon(square(0, 0, 10)), spacing=2, angle_deg=90)
    xs = sorted({round(x, 6) for line in lines for x, _ in line})
    assert xs == [1, 3, 5, 7, 9]


# ---------------------------------------------------------------- contour


def test_contour_square_rings_inwards_as_one_spiral():
    area = Polygon(square(0, 0, 20))
    lines = contour(area, spacing=2, brush_radius=1.25, start=(0, 0))
    assert len(lines) == 1  # each ring joined to the previous one
    line = LineString(lines[0])
    assert line.within(area.buffer(1e-6))
    # outermost ring is the area's outline
    xs = [x for x, _ in lines[0]]
    assert min(xs) == pytest.approx(0) and max(xs) == pytest.approx(20)
    # a brush of radius 1.25 along the path covers everything, including the middle
    assert line.buffer(1.25).contains(area.buffer(-0.01))


@pytest.mark.parametrize("size", [9.0, 10.0, 11.5, 13.0, 17.3])
def test_contour_leaves_no_gap_in_the_middle(size):
    area = Polygon(square(0, 0, size))
    lines = contour(area, spacing=2.4, brush_radius=1.5, start=(0, 0))
    covered = unary_union([LineString(l).buffer(1.5) for l in lines])
    assert covered.contains(area.buffer(-0.01))


def test_contour_with_hole_does_not_cross_the_hole():
    area = Polygon(square(0, 0, 20)).difference(Polygon(square(7, 7, 6)))
    lines = contour(area, spacing=1.5, brush_radius=1, start=(0, 0))
    for line in lines:
        assert LineString(line).within(area.buffer(1e-3))
    covered = unary_union([LineString(l).buffer(1) for l in lines])
    assert covered.contains(area.buffer(-0.01))


def test_plan_with_contour_pattern(request_all):
    settings = request_all.settings.model_copy(update={"fill": FillSettings(pattern="contour", overlap=0.2)})
    plan = plan_painting(request_all.model_copy(update={"settings": settings}), CONFIG)
    red = next(f for f in plan.files if f.well_color == "#ff0000")
    big = Polygon([(30, 80), (80, 80), (80, 110), (30, 110)])
    strokes_in_big = [s for s in red.strokes if LineString(s).intersects(big)]
    assert all(LineString(s).within(big.buffer(-1.5 + 1e-3)) for s in strokes_in_big)
    # brush paths (3 mm wide) cover the shrunk rectangle
    covered = unary_union([LineString(s).buffer(1.5) for s in strokes_in_big])
    assert covered.contains(big.buffer(-1.5))


# ---------------------------------------------------------------- dots


def test_square_dots_grid():
    pts = dots(Polygon(square(0, 0, 10)), spacing=2.5, grid="square", jitter=0, rng=random.Random(0))
    assert len(pts) == 25  # 0, 2.5, 5, 7.5, 10 in both directions
    assert all(0 <= x <= 10 and 0 <= y <= 10 for x, y in pts)


@pytest.mark.parametrize("grid", ["hex", "square"])
def test_dots_cover_the_area_with_enough_overlap(grid):
    area = Polygon(square(0, 0, 20))
    brush_r = 1.5
    spacing = 3 * (1 - (0.2 if grid == "hex" else 0.3))  # square needs ≥ 29 % overlap
    pts = dots(area, spacing, grid, 0, random.Random(0))
    covered = unary_union([Point_(p).buffer(brush_r) for p in pts])
    assert covered.contains(area.buffer(-brush_r))


def test_dots_jitter_is_reproducible_and_stays_inside():
    area = Polygon(square(0, 0, 10))
    a = dots(area, 2, "hex", 0.8, random.Random(0))
    b = dots(area, 2, "hex", 0.8, random.Random(0))
    plain = dots(area, 2, "hex", 0, random.Random(0))
    assert a == b and a != plain
    assert all(area.buffer(1e-6).contains(Point_(p)) for p in a)


@pytest.mark.parametrize("grid", ["hex", "square"])
def test_dots_form_a_regular_lattice(grid):
    """No extra rows: every dot's nearest neighbour is exactly one spacing away."""
    from shapely import affinity

    area = affinity.scale(Point_(0, 0).buffer(1, quad_segs=64), 30, 18)
    pts = dots(area, 4.0, grid, 0, random.Random(0))
    nearest = [min(math.dist(p, q) for q in pts if q != p) for p in pts]
    assert nearest == pytest.approx([4.0] * len(pts))


def test_lattice_is_shared_between_shapes():
    a = dots(Polygon(square(0, 0, 10)), 2.5, "hex", 0, random.Random(0))
    b = dots(Polygon(square(12.3, 0, 10)), 2.5, "hex", 0, random.Random(0))
    rows_a = {round(y, 6) for _, y in a}
    rows_b = {round(y, 6) for _, y in b}
    assert rows_a == rows_b  # same rows in both shapes
    # x positions in a row continue the same lattice (multiples of the spacing, hex rows offset by half)
    for x, y in a + b:
        k = round(y / (2.5 * math.sqrt(3) / 2))
        assert ((x - (1.25 if k % 2 else 0)) / 2.5) == pytest.approx(round((x - (1.25 if k % 2 else 0)) / 2.5))


def test_plan_dots_inside_vs_to_edge(request_all):
    big = Polygon([(30, 80), (80, 80), (80, 110), (30, 110)])  # red rect on the bed
    edge_dist = lambda plan: [big.exterior.distance(Point_(c)) for c in _red_dots(plan) if big.contains(Point_(c)) or big.exterior.distance(Point_(c)) < 1e-6]  # noqa: E731
    inside = edge_dist(_plan_dots(request_all, dots_to_edge=False, overlap=-0.5))
    to_edge = edge_dist(_plan_dots(request_all, dots_to_edge=True, overlap=-0.5))
    assert min(inside) >= 1.5 - 1e-6  # dabs stay inside the shape
    assert min(to_edge) < 1.5  # centres come closer to the edge than half a brush


def test_tiny_area_gets_one_dot():
    pts = dots(Polygon(square(0, 0, 0.5)), 3, "hex", 0, random.Random(0))
    assert len(pts) == 1


def _plan_dots(request_all, **fill):
    settings = request_all.settings.model_copy(update={"fill": FillSettings(pattern="dots", **fill)})
    return plan_painting(request_all.model_copy(update={"settings": settings}), CONFIG)


def _red_dots(plan):
    red = next(f for f in plan.files if f.well_color == "#ff0000")
    return [st[0] for st in red.strokes]


@pytest.mark.parametrize("to_edge", [False, True])
@pytest.mark.parametrize("jitter", [0, 0.6])
def test_dots_cover_curved_shapes_completely(to_edge, jitter):
    """Ellipse and circle, both modes, with and without jitter: no uncovered specks left."""
    from shapely import affinity

    r = 1.5
    for area in (affinity.scale(Point_(0, 0).buffer(1, quad_segs=64), 37.5, 20), Point_(0, 0).buffer(25, quad_segs=64)):
        target = area if to_edge else area.buffer(-r)
        pts = dots(target, 2.4, "hex", jitter, random.Random(0))
        region = area if to_edge else target.buffer(r / 2).intersection(area)  # inside: scalloped edge strip
        pts, _ = fill_gaps(pts, region, r, target)
        assert all(target.buffer(1e-3).contains(Point_(p)) for p in pts)
        covered = unary_union([Point_(p).buffer(r) for p in pts])
        specks = _polygons(region.difference(covered))
        assert all(g.area <= 0.05 + 1e-9 for g in specks), max(g.area for g in specks)


def _polygons(geom):
    return list(getattr(geom, "geoms", [geom])) if not geom.is_empty else []


def test_negative_overlap_leaves_gaps_on_purpose(request_all):
    dense = _red_dots(_plan_dots(request_all, overlap=0.2))
    sparse_plan = _plan_dots(request_all, overlap=-1.0)  # spacing = 2 × brush
    sparse = _red_dots(sparse_plan)
    assert len(sparse) < len(dense) / 3
    assert not any("extra dots" in w for w in sparse_plan.warnings)
    # neighbours are about 2 brush widths apart: dabs don't touch
    nearest = [min(math.dist(p, q) for q in sparse if q != p) for p in sparse[:50]]
    assert min(nearest) > 3  # brush 3 mm


def test_plan_with_dots_dips_every_n_dots(request_all):
    fill = FillSettings(pattern="dots", dots_per_dip=10)
    settings = request_all.settings.model_copy(update={"fill": fill})
    plan = plan_painting(request_all.model_copy(update={"settings": settings}), CONFIG)
    red = next(f for f in plan.files if f.well_color == "#ff0000")
    n_dots = sum(1 for st in red.strokes if st[0] == st[-1] and len(st) == 2)
    assert n_dots > 10
    assert red.dips == math.ceil(n_dots / 10)  # red has no lines, only dots
    body = red.gcode.split("; dip into")
    # between dips: at most 10 dabs (down/up pairs) besides the dip itself
    assert all(chunk.count("G0 Z0") <= 11 for chunk in body[1:])
    # the green line layer still gets painted as a stroke
    green = next(f for f in plan.files if f.well_color == "#00aa00")
    assert green.paint_length_mm > 0


# ---------------------------------------------------------------- paint per dip


def test_split_dips_every_paint_distance_and_continues():
    stroke = [(0, 0), (25, 0)]
    events = list(split_by_paint([stroke], 10))
    kinds = [k for k, _ in events]
    assert kinds == ["dip", "stroke", "dip", "stroke", "dip", "stroke"]
    pieces = [p for k, p in events if k == "stroke"]
    assert [length(p) for p in pieces] == pytest.approx([10, 10, 5])
    assert pieces[1][0] == pieces[0][-1] and pieces[2][0] == pieces[1][-1]


def test_split_carries_remaining_paint_to_next_stroke():
    events = list(split_by_paint([[(0, 0), (6, 0)], [(0, 1), (6, 1)]], 10))
    # 6 mm, then the rest of the paint (4 mm) on the second stroke, dip, the last 2 mm
    assert [k for k, _ in events] == ["dip", "stroke", "stroke", "dip", "stroke"]
    pieces = [p for k, p in events if k == "stroke"]
    assert [length(p) for p in pieces] == pytest.approx([6, 4, 2])


def test_resume_overlap_goes_back_and_adds_to_the_piece():
    # 15 mm per dip, restart 2 mm back: 0–15, 13–30, 28–40
    events = list(split_by_paint([[(0, 0), (40, 0)]], 15, resume_overlap=2))
    pieces = [p for k, p in events if k == "stroke"]
    assert [k for k, _ in events].count("dip") == 3
    assert [(p[0][0], p[-1][0]) for p in pieces] == pytest.approx([(0, 15), (13, 30), (28, 40)])


def test_resume_overlap_follows_corners():
    # cut 1 mm after a corner: going back 3 mm walks around the corner
    stroke = [(0, 0), (10, 0), (10, 10)]
    pieces = [p for k, p in split_by_paint([stroke], 11, resume_overlap=3) if k == "stroke"]
    assert pieces[1][0] == pytest.approx((8, 0))
    assert pieces[1][1] == pytest.approx((10, 0))
    assert length(pieces[1]) == pytest.approx(3 + 9)


def test_resume_overlap_never_goes_before_the_stroke_start():
    # first stroke uses 14 of 15 mm; the second is cut 1 mm in, so it can only go back 1 mm
    events = list(split_by_paint([[(0, 0), (14, 0)], [(0, 5), (20, 5)]], 15, resume_overlap=2))
    pieces = [p for k, p in events if k == "stroke"]
    assert [(p[0], p[-1]) for p in pieces[1:]] == pytest.approx(
        [((0, 5), (1, 5)), ((0, 5), (16, 5)), ((14, 5), (20, 5))]
    )


def test_no_overlap_before_a_new_stroke():
    # paint runs out exactly at a stroke end: the next stroke starts at its own start
    events = list(split_by_paint([[(0, 0), (15, 0)], [(0, 5), (10, 5)]], 15, resume_overlap=2))
    pieces = [p for k, p in events if k == "stroke"]
    assert pieces[1][0] == pytest.approx((0, 5))


# ---------------------------------------------------------------- full plan


@pytest.fixture(scope="module")
def request_all():
    with SAMPLE.open() as f:
        drawing = read_svg(f)
    colors = list(dict.fromkeys(l.color for l in drawing.layers))
    placement = Placement(x=20, y=20, scale=1)
    drawing_rect = Rect(x=20, y=20, width_mm=drawing.width_mm, height_mm=drawing.height_mm)
    layout = arrange_palette(WellLayout(name="t"), colors, CONFIG, drawing_rect)
    color_map = {w.color: w.id for w in layout.wells}
    return PaintRequest(
        layers=drawing.layers,
        placement=placement,
        layout=layout,
        color_map=color_map,
        settings=PaintSettings(brush_width_mm=3, paint_distance_mm=100),
    )


def test_plan_one_file_per_well(request_all):
    plan = plan_painting(request_all, CONFIG)
    assert [f.filename.split("_")[0] for f in plan.files] == ["02", "03", "04", "05", "06"]
    assert all(f.dips >= 1 for f in plan.files)
    assert plan.warnings == []


def test_plan_gcode_in_bounds_and_dips_at_well(request_all):
    plan = plan_painting(request_all, CONFIG)
    red = next(f for f in plan.files if f.well_color == "#ff0000")
    well = next(w for w in request_all.layout.wells if w.id == red.well_id)
    pts = [(float(x), float(y)) for x, y in re.findall(r"X(-?[\d.]+) Y(-?[\d.]+)", red.gcode)]
    assert all(0 <= x <= 500 and 0 <= y <= 500 for x, y in pts)
    assert red.gcode.count("; dip into") == red.dips
    assert (round(well.x, 2), round(well.y, 2)) in [(round(x, 2), round(y, 2)) for x, y in pts]
    # paint per dip respected: total painted ≤ dips × distance
    assert red.paint_length_mm <= red.dips * 100 + 1e-6


def test_fill_strokes_stay_half_a_brush_inside(request_all):
    plan = plan_painting(request_all, CONFIG)
    red = next(f for f in plan.files if f.well_color == "#ff0000")
    # Red rect: x 30..80, y 80..110 on the bed (SVG 10..60 / page-flipped, offset 20)
    big = Polygon(square(30, 80, 50)).intersection(Polygon([(30, 80), (80, 80), (80, 110), (30, 110)]))
    inner = big.buffer(-1.5 + 1e-3)
    strokes_in_big = [s for s in red.strokes if LineString(s).intersects(big)]
    assert strokes_in_big
    assert all(LineString(s).within(inner) for s in strokes_in_big)


def test_unmapped_colors_are_reported(request_all):
    req = request_all.model_copy(update={"color_map": {**request_all.color_map, "#0000ff": None}})
    plan = plan_painting(req, CONFIG)
    assert len(plan.files) == 4
    assert any("#0000ff" in w for w in plan.warnings)


def test_circle_dip(request_all):
    settings = request_all.settings.model_copy(update={"dip": DipSettings(mode="circle", circle_radius_mm=4)})
    plan = plan_painting(request_all.model_copy(update={"settings": settings}), CONFIG)
    f = plan.files[0]
    well = next(w for w in request_all.layout.wells if w.id == f.well_id)
    # the circle passes through (well.x + r, well.y)
    assert f"X{well.x + 4:.2f}".rstrip("0").rstrip(".") in f.gcode


def test_export_zip(request_all):
    res = TestClient(app).post("/api/paint/export", json=request_all.model_dump())
    assert res.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(res.content)).namelist()
    assert names[0] == "01_t_pencil.gcode"  # no project name: falls back to the layout name
    assert "02_1_ff0000_brush.gcode" in names
    assert "steps.txt" in names


def test_plan_endpoint_out_of_bounds_is_422(request_all):
    req = request_all.model_copy(update={"placement": Placement(x=450, y=20, scale=1)})
    res = TestClient(app).post("/api/paint/plan", json=req.model_dump())
    assert res.status_code == 422


def test_export_to_project_folder_replaces_old_export(request_all, data_dir):
    client = TestClient(app)
    client.post("/api/projects", json={"name": "p"})
    out = data_dir / "projects" / "p" / "gcode"
    out.mkdir(parents=True)
    (out / "09_old_brush.gcode").write_text("stale")
    (out / "notes.md").write_text("mine")  # not ours: must survive
    res = client.post("/api/projects/p/export", json=request_all.model_dump())
    assert res.status_code == 200
    body = res.json()
    assert body["folder"] == str(out.resolve())
    assert body["files"][0] == "01_t_pencil.gcode" and body["files"][-1] == "steps.txt"
    on_disk = sorted(f.name for f in out.iterdir())
    assert "09_old_brush.gcode" not in on_disk
    assert "notes.md" in on_disk
    assert set(body["files"]) <= set(on_disk)
    assert (out / "02_1_ff0000_brush.gcode").read_text().startswith("; Paint Plotter")


def test_export_to_missing_project_is_404(request_all):
    res = TestClient(app).post("/api/projects/nope/export", json=request_all.model_dump())
    assert res.status_code == 404
