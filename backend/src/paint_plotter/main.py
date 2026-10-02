import io

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from paint_plotter.config import REPO_ROOT, PlotterConfig, load_config
from paint_plotter.gcode import GcodeError
from paint_plotter.svg_import import SvgDrawing, read_svg
from paint_plotter.wells import (
    Rect,
    WellLayout,
    arrange_palette,
    check_layout,
    delete_layout,
    layout_gcode,
    list_layouts,
    load_layout,
    safe_name,
    save_layout,
)

FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

app = FastAPI(title="Paint Plotter")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def get_config() -> PlotterConfig:
    return load_config()


@app.post("/api/svg")
async def import_svg(file: UploadFile) -> SvgDrawing:
    data = await file.read()
    try:
        return read_svg(io.StringIO(data.decode("utf-8")))
    except Exception as e:  # svgelements/vpype raise many kinds of errors on bad input
        raise HTTPException(status_code=422, detail=f"Could not read SVG: {e}") from e


@app.get("/api/well-layouts")
def get_well_layouts() -> list[str]:
    return list_layouts()


@app.get("/api/well-layouts/{name}")
def get_well_layout(name: str) -> WellLayout:
    try:
        return load_layout(name)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=f"Well layout {name!r} not found") from e


@app.put("/api/well-layouts/{name}")
def put_well_layout(name: str, layout: WellLayout) -> WellLayout:
    if name != layout.name:
        raise HTTPException(status_code=400, detail="Name in URL and body differ")
    try:
        save_layout(layout)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return layout


@app.delete("/api/well-layouts/{name}", status_code=204)
def delete_well_layout(name: str) -> None:
    try:
        delete_layout(name)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=f"Well layout {name!r} not found") from e


class LayoutCheck(BaseModel):
    warnings: list[str]


@app.post("/api/well-layouts/check")
def check_well_layout(layout: WellLayout) -> LayoutCheck:
    return LayoutCheck(warnings=check_layout(layout, load_config()))


class ArrangeRequest(BaseModel):
    layout: WellLayout
    colors: list[str]
    # Placed drawing on the bed; the palette goes into the opposite corner.
    drawing: Rect | None = None


@app.post("/api/well-layouts/arrange")
def arrange_well_layout(req: ArrangeRequest) -> WellLayout:
    return arrange_palette(req.layout, req.colors, load_config(), req.drawing)


@app.post("/api/well-layouts/gcode", response_class=PlainTextResponse)
def well_layout_gcode(layout: WellLayout) -> PlainTextResponse:
    try:
        gcode = layout_gcode(layout, load_config())
    except GcodeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    filename = f"01_layout_{safe_name(layout.name)}_pencil.gcode"
    return PlainTextResponse(gcode, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# Serve the built frontend (npm run build). In development, Vite serves it instead.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and file.is_relative_to(FRONTEND_DIST):
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
