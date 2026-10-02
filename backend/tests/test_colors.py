import pytest
from fastapi.testclient import TestClient

from paint_plotter.colors import delta_e, hex_to_lab, match_colors
from paint_plotter.main import app
from paint_plotter.wells import Well


def well(id: str, color: str) -> Well:
    return Well(id=id, name=id, color=color, shape="cross", x=0, y=0, width_mm=10, height_mm=10)


def test_lab_reference_values():
    assert hex_to_lab("#ffffff") == pytest.approx((100, 0, 0), abs=0.05)
    assert hex_to_lab("#000000") == pytest.approx((0, 0, 0), abs=0.05)
    # sRGB red in CIELAB (D65)
    assert hex_to_lab("#ff0000") == pytest.approx((53.24, 80.09, 67.20), abs=0.05)


def test_delta_e():
    assert delta_e("#123456", "#123456") == 0
    assert delta_e("#ff0000", "#fe0000") < 1
    assert delta_e("#ff0000", "#0000ff") > 100


def test_match_picks_closest_well():
    wells = [well("red", "#e01010"), well("blue", "#1020d0"), well("yellow", "#ffd000")]
    m = match_colors(["#ff0000", "#0000ff", "#ffcc00"], wells)
    assert [x.best_well_id for x in m] == ["red", "blue", "yellow"]
    assert set(m[0].distances) == {"red", "blue", "yellow"}


def test_match_without_wells():
    assert match_colors(["#ff0000"], [])[0].best_well_id is None


def test_match_endpoint():
    res = TestClient(app).post(
        "/api/colors/match",
        json={"colors": ["#ff0000"], "wells": [well("a", "#ff0000").model_dump()]},
    )
    assert res.json() == [{"color": "#ff0000", "best_well_id": "a", "distances": {"a": 0.0}}]
