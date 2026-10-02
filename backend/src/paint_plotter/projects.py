"""Projects: one folder per painting under data/projects/<name>/.

    project.json  everything the user set up (placement, hidden layers, color choices,
                  paint settings, the working well layout)
    drawing.svg   the uploaded SVG (original file name kept in project.json)
    gcode/        the last "save G-code to project folder" export

The frontend autosaves the project; the drawing is re-read from drawing.svg on load.
"""

import io
import shutil
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from paint_plotter.config import data_dir
from paint_plotter.painting import PaintSettings, Placement
from paint_plotter.svg_import import SvgDrawing, read_svg
from paint_plotter.wells import WellLayout, safe_name

DEFAULT_PROJECT = "default"
SVG_FILE = "drawing.svg"
PROJECT_FILE = "project.json"
EXPORT_DIR = "gcode"


class Project(BaseModel):
    name: str = Field(min_length=1)
    svg_filename: str | None = None  # original name of the uploaded SVG
    placement: Placement = Placement()
    hidden_layers: list[str] = []
    # Drawing color → well id, or None for "don't paint". Missing colors use the closest well.
    color_choices: dict[str, str | None] = {}
    paint_settings: PaintSettings = PaintSettings()
    layout: WellLayout = WellLayout(name="untitled")
    updated: str | None = None  # ISO time of the last save, set by the server


class ProjectInfo(BaseModel):
    name: str
    updated: str | None
    svg_filename: str | None


class ProjectData(BaseModel):
    project: Project
    drawing: SvgDrawing | None


class ProjectError(ValueError):
    pass


class ProjectNotFound(ProjectError):
    pass


def _root() -> Path:
    d = data_dir() / "projects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _dir(name: str) -> Path:
    return _root() / safe_name(name)


def exists(name: str) -> bool:
    return (_dir(name) / PROJECT_FILE).is_file()


def list_projects() -> list[ProjectInfo]:
    infos = []
    for f in _root().glob(f"*/{PROJECT_FILE}"):
        p = Project.model_validate_json(f.read_text())
        infos.append(ProjectInfo(name=p.name, updated=p.updated, svg_filename=p.svg_filename))
    return sorted(infos, key=lambda i: i.updated or "", reverse=True)


def _write(project: Project) -> Project:
    project = project.model_copy(update={"updated": datetime.now(UTC).isoformat(timespec="seconds")})
    d = _dir(project.name)
    d.mkdir(parents=True, exist_ok=True)
    (d / PROJECT_FILE).write_text(project.model_dump_json(indent=2))
    return project


def load(name: str) -> ProjectData:
    d = _dir(name)
    if not (d / PROJECT_FILE).is_file():
        raise ProjectNotFound(f"Project {name!r} not found")
    project = Project.model_validate_json((d / PROJECT_FILE).read_text())
    drawing = None
    if (d / SVG_FILE).is_file():
        drawing = read_svg(io.StringIO((d / SVG_FILE).read_text()))
    return ProjectData(project=project, drawing=drawing)


def create(name: str) -> ProjectData:
    if exists(name):
        raise ProjectError(f"Project {name!r} already exists")
    return ProjectData(project=_write(Project(name=name)), drawing=None)


def save(project: Project) -> Project:
    if not exists(project.name):
        raise ProjectNotFound(f"Project {project.name!r} not found")
    return _write(project)


def store_svg(name: str, filename: str, svg_text: str) -> ProjectData:
    """Parse first (so a broken file doesn't replace a good one), then store it."""
    if not exists(name):
        raise ProjectNotFound(f"Project {name!r} not found")
    drawing = read_svg(io.StringIO(svg_text))
    d = _dir(name)
    (d / SVG_FILE).write_text(svg_text)
    project = Project.model_validate_json((d / PROJECT_FILE).read_text())
    project = _write(project.model_copy(update={"svg_filename": filename}))
    return ProjectData(project=project, drawing=drawing)


def rename(old: str, new: str) -> Project:
    if not exists(old):
        raise ProjectNotFound(f"Project {old!r} not found")
    if safe_name(new) != safe_name(old) and _dir(new).exists():
        raise ProjectError(f"Project {new!r} already exists")
    _dir(old).rename(_dir(new))
    project = Project.model_validate_json((_dir(new) / PROJECT_FILE).read_text())
    return _write(project.model_copy(update={"name": new}))


def write_export(name: str, files: list[tuple[str, str]]) -> Path:
    """Replaces the project's gcode/ export with `files`. Only *.gcode and steps.txt from an
    earlier export are removed, so stale files from removed wells don't linger."""
    if not exists(name):
        raise ProjectNotFound(f"Project {name!r} not found")
    out = _dir(name) / EXPORT_DIR
    out.mkdir(exist_ok=True)
    for old in [*out.glob("*.gcode"), out / "steps.txt"]:
        old.unlink(missing_ok=True)
    for filename, content in files:
        (out / filename).write_text(content)
    return out.resolve()


def delete(name: str) -> None:
    if not exists(name):
        raise ProjectNotFound(f"Project {name!r} not found")
    shutil.rmtree(_dir(name))
