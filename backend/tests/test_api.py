import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from paint_plotter.config import load_config
from paint_plotter.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_config_endpoint_returns_work_area():
    data = client.get("/api/config").json()
    assert data["work_area"]["width_mm"] > 0
    assert data["z"]["up"] > 1
    assert data["z"]["down"] <= 0


def _write(tmp_path, z):
    cfg = {
        "work_area": {"width_mm": 500, "height_mm": 500},
        "z": z,
        "feed_rates": {"travel_mm_min": 3000, "paint_mm_min": 1500},
    }
    p = tmp_path / "plotter.json"
    p.write_text(json.dumps(cfg))
    return p


@pytest.mark.parametrize("z", [{"up": 1, "down": 0}, {"up": 2, "down": 0.5}])
def test_config_rejects_ambiguous_z(tmp_path, z):
    with pytest.raises(ValidationError):
        load_config(_write(tmp_path, z))
