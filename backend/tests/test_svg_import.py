import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from paint_plotter.main import app
from paint_plotter.svg_import import read_svg

SAMPLE = Path(__file__).parent / "data" / "sample.svg"


@pytest.fixture(scope="module")
def drawing():
    with SAMPLE.open() as f:
        return read_svg(f)


def layer(drawing, layer_id):
    return next(l for l in drawing.layers if l.id == layer_id)


def test_page_size_in_mm(drawing):
    assert drawing.width_mm == pytest.approx(200, abs=0.01)
    assert drawing.height_mm == pytest.approx(100, abs=0.01)


def test_layers_split_by_kind_and_color(drawing):
    ids = [l.id for l in drawing.layers]
    assert "fill-#ff0000" in ids
    assert "fill-#0000ff" in ids
    assert "fill-#ffcc00" in ids
    assert any(i.startswith("stroke-#000000") for i in ids)
    assert any(i.startswith("stroke-#00aa00") for i in ids)
    # stroke:none and fill:none produce no layers
    assert not any(i.startswith("fill-#00aa00") for i in ids)
    assert not any(i.startswith("stroke-#ffcc00") for i in ids)


def test_inherited_group_fill_merges_into_same_layer(drawing):
    assert len(layer(drawing, "fill-#ff0000").paths) == 2


def test_y_is_flipped_to_plotter_coords(drawing):
    # The red rect spans y = 10..40 in the SVG (Y down), so y = 60..90 from the page bottom.
    rect = layer(drawing, "fill-#ff0000").paths[0]
    ys = [y for _, y in rect]
    assert min(ys) == pytest.approx(60, abs=0.01)
    assert max(ys) == pytest.approx(90, abs=0.01)


def test_stroke_width_in_mm(drawing):
    green = next(l for l in drawing.layers if l.id.startswith("stroke-#00aa00"))
    assert green.stroke_width_mm == pytest.approx(2, abs=0.01)
    assert green.length_mm == pytest.approx((40**2 + 80**2) ** 0.5, abs=0.1)


def test_unsupported_colors_are_warned_not_painted_black():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10">
      <rect width="5" height="5" fill="url(#gradient)"/></svg>"""
    d = read_svg(io.StringIO(svg))
    assert d.layers == []
    assert d.warnings


def test_upload_endpoint():
    client = TestClient(app)
    res = client.post("/api/svg", files={"file": ("sample.svg", SAMPLE.read_bytes(), "image/svg+xml")})
    assert res.status_code == 200
    assert len(res.json()["layers"]) == 5


def test_upload_rejects_garbage():
    client = TestClient(app)
    res = client.post("/api/svg", files={"file": ("x.svg", b"not an svg", "image/svg+xml")})
    assert res.status_code == 422
