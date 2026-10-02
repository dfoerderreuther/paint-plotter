import re

import pytest
from fastapi.testclient import TestClient

from paint_plotter.config import load_config
from paint_plotter.gcode import GcodeError, GcodeWriter
from paint_plotter.main import app
from paint_plotter.wells import Rect, Well, WellLayout, arrange_palette, check_layout, layout_gcode

client = TestClient(app)
CONFIG = load_config()


def make_layout(**kw) -> WellLayout:
    data = dict(
        name="Studio A",
        wells=[
            Well(id="1", name="Red", color="#ff0000", shape="circle", x=40, y=40, width_mm=50, height_mm=50),
            Well(id="2", name="Blue", color="#0000ff", shape="rect", x=150, y=40, width_mm=60, height_mm=40),
        ],
    )
    data.update(kw)
    return WellLayout(**data)


def coords(gcode: str) -> list[tuple[float, float]]:
    return [(float(m[1]), float(m[2])) for m in re.finditer(r"X(-?[\d.]+) Y(-?[\d.]+)", gcode)]


# ---------------------------------------------------------------- checks


def test_valid_layout_has_no_warnings():
    assert check_layout(make_layout(), CONFIG) == []


def test_well_outside_bed():
    layout = make_layout()
    layout.wells[0].x = 10  # circle radius 25 sticks out on the left
    assert any("outside the work area" in w for w in check_layout(layout, CONFIG))


def test_wells_too_close_to_each_other():
    layout = make_layout()
    layout.wells[1].x = 90  # rect left edge at 60, circle right edge at 65
    assert any("'Red' and 'Blue'" in w for w in check_layout(layout, CONFIG))


def test_cross_label_outside_bed_is_warned():
    layout = make_layout(
        wells=[Well(id="c", name="Yellow", color="#ffcc00", shape="cross", x=490, y=40, width_mm=10, height_mm=10)]
    )
    assert any("Label of well 'Yellow'" in w for w in check_layout(layout, CONFIG))


# ---------------------------------------------------------------- G-code


def test_gcode_writer_starts_and_ends_with_tool_up_at_park():
    g = GcodeWriter(CONFIG, "t", tool="pencil")
    g.polyline([(10, 10), (20, 10)])
    out = g.finish().splitlines()
    z_moves = [l for l in out if l.startswith("G0 Z")]
    assert z_moves[0].startswith("G0 Z2") and z_moves[-1].startswith("G0 Z2")
    assert "G0 Z0" in "\n".join(out)
    assert [l for l in out if l.startswith("G0 X")][-1].startswith("G0 X0 Y0")
    assert not any(l.startswith(("M0", "M1 ", "M6")) for l in out)


def test_gcode_writer_refuses_moves_outside_work_area():
    g = GcodeWriter(CONFIG, "t", tool="pencil")
    with pytest.raises(GcodeError):
        g.polyline([(10, 10), (510, 10)])


def test_cross_is_two_lines_with_label_beside_it():
    layout = make_layout(
        wells=[Well(id="c", name="Yellow", color="#ffcc00", shape="cross", x=100, y=50, width_mm=20, height_mm=20)]
    )
    gcode = layout_gcode(layout, CONFIG)
    well_part = gcode.split("; well 'Yellow' #ffcc00")[1]
    assert "G1 X110 Y50" in well_part  # horizontal arm ends at x + 10
    assert "G1 X100 Y60" in well_part  # vertical arm ends at y + 10
    label_xs = [x for x, _ in coords(well_part.split("G0 Z2", 2)[2])][:-1]  # after both arms, minus park
    assert min(label_xs) >= 110  # label right of the cross


def test_layout_gcode_stays_in_work_area_and_draws_everything():
    gcode = layout_gcode(make_layout(), CONFIG)
    pts = coords(gcode)
    assert all(0 <= x <= 500 and 0 <= y <= 500 for x, y in pts)
    assert "painting area" not in gcode
    assert "; well 'Red' #ff0000" in gcode
    assert "; well 'Blue' #0000ff" in gcode
    # circle outline: some point at distance r = 25 from the centre (40, 40)
    assert any(abs(((x - 40) ** 2 + (y - 40) ** 2) ** 0.5 - 25) < 0.01 for x, y in pts)


# ---------------------------------------------------------------- API


def test_save_list_load_delete(data_dir):
    layout = make_layout()
    body = layout.model_dump()
    assert client.put("/api/well-layouts/Studio A", json=body).status_code == 200
    assert (data_dir / "well_layouts" / "Studio_A.json").exists()
    assert client.get("/api/well-layouts").json() == ["Studio A"]
    assert client.get("/api/well-layouts/Studio A").json() == body
    assert client.delete("/api/well-layouts/Studio A").status_code == 204
    assert client.get("/api/well-layouts/Studio A").status_code == 404


def test_check_endpoint():
    layout = make_layout()
    layout.wells[0].x = 10
    res = client.post("/api/well-layouts/check", json=layout.model_dump())
    assert res.json()["warnings"]


def test_gcode_endpoint_returns_numbered_file():
    res = client.post("/api/well-layouts/gcode", json=make_layout().model_dump())
    assert res.status_code == 200
    assert 'filename="01_Studio_A_pencil.gcode"' in res.headers["content-disposition"]
    res = client.post("/api/well-layouts/gcode?project=My Cat", json=make_layout().model_dump())
    assert 'filename="01_My_Cat_pencil.gcode"' in res.headers["content-disposition"]
    assert res.text.startswith("; Paint Plotter")


def test_gcode_endpoint_rejects_out_of_bounds():
    layout = make_layout()
    layout.wells[0].x = 600
    res = client.post("/api/well-layouts/gcode", json=layout.model_dump())
    assert res.status_code == 422


# ---------------------------------------------------------------- palette arrangement

COLORS = ["#ff0000", "#00aa00", "#0000ff", "#ffcc00", "#000000"]


DRAWING_BOTTOM_LEFT = Rect(x=0, y=0, width_mm=280, height_mm=200)


def test_arrange_puts_palette_in_corner_opposite_the_drawing():
    out = arrange_palette(make_layout(wells=[]), COLORS, CONFIG, DRAWING_BOTTOM_LEFT)
    assert out.palette.x + out.palette.width_mm == 500  # right edge
    assert out.palette.y + out.palette.height_mm == 500  # top edge
    assert check_layout(out, CONFIG) == []


def test_arrange_one_cross_per_color_inside_page():
    drawing = Rect(x=220, y=210, width_mm=280, height_mm=290)  # top right
    out = arrange_palette(make_layout(wells=[]), COLORS, CONFIG, drawing)
    assert (out.palette.x, out.palette.y) == (0, 0)
    assert [w.color for w in out.wells] == COLORS
    assert all(w.shape == "cross" for w in out.wells)
    assert len({(w.x, w.y) for w in out.wells}) == len(COLORS)
    assert check_layout(out, CONFIG) == []


def test_arrange_without_drawing_uses_top_right():
    out = arrange_palette(make_layout(wells=[]), COLORS, CONFIG)
    assert (out.palette.x + out.palette.width_mm, out.palette.y + out.palette.height_mm) == (500, 500)


def test_arrange_endpoint():
    res = client.post(
        "/api/well-layouts/arrange",
        json={"layout": make_layout(wells=[]).model_dump(), "colors": COLORS, "drawing": DRAWING_BOTTOM_LEFT.model_dump()},
    )
    assert res.status_code == 200
    assert len(res.json()["wells"]) == 5
