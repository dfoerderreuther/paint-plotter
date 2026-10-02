import io

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from paint_plotter.config import REPO_ROOT, PlotterConfig, load_config
from paint_plotter.svg_import import SvgDrawing, read_svg

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


# Serve the built frontend (npm run build). In development, Vite serves it instead.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and file.is_relative_to(FRONTEND_DIST):
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
