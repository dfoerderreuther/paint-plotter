import json
import os
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "plotter.json"


class WorkArea(BaseModel):
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)


class ZConfig(BaseModel):
    """The plotter's Z axis is only a switch: Z > 1 is up, Z <= 0 is down."""

    up: float
    down: float

    @field_validator("up")
    @classmethod
    def up_above_one(cls, v: float) -> float:
        if v <= 1:
            raise ValueError("z.up must be > 1 (firmware treats Z > 1 as up)")
        return v

    @field_validator("down")
    @classmethod
    def down_at_most_zero(cls, v: float) -> float:
        if v > 0:
            raise ValueError("z.down must be <= 0 (firmware treats Z <= 0 as down)")
        return v


class FeedRates(BaseModel):
    travel_mm_min: float = Field(gt=0)
    paint_mm_min: float = Field(gt=0)


class PlotterConfig(BaseModel):
    work_area: WorkArea
    z: ZConfig
    feed_rates: FeedRates


def config_path() -> Path:
    return Path(os.environ.get("PAINT_PLOTTER_CONFIG", DEFAULT_CONFIG_PATH))


def load_config(path: Path | None = None) -> PlotterConfig:
    path = path or config_path()
    return PlotterConfig.model_validate(json.loads(path.read_text()))
