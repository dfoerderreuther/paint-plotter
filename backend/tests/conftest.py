import pytest


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Keep saved layouts/projects out of the real projects/ folder."""
    monkeypatch.setenv("PAINT_PLOTTER_DATA", str(tmp_path / "data"))
    return tmp_path / "data"
