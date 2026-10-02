# Paint Plotter

A local web app with a Python API. It shows SVG drawings and turns them into G-code
so a pen plotter fitted with a **paint brush** can paint them. The brush picks up
paint from color wells ("reference areas") on the plotter bed.

## Working rules

- Implementation has started (2026-10-02). Work through the roadmap one step at a time.
- Keep this file up to date as decisions are made.

## Project layout & commands

```
backend/                    Python (uv) – FastAPI app, vpype
  src/paint_plotter/main.py FastAPI app: /api/* and serves frontend/dist
  src/paint_plotter/config.py  Loads and validates config/plotter.json
  src/paint_plotter/svg_import.py  SVG → paint layers (vpype), POST /api/svg
  tests/                    pytest (tests/data/sample.svg = test drawing)
config/plotter.json         Plotter config (work area, Z up/down, feed rates)
frontend/                   React + antd + TypeScript (Vite)
  src/api.ts                API types (mirror the pydantic models) and fetch helpers
  src/components/Bed.tsx    Work area in machine coordinates (origin bottom left)
  src/components/DrawingView.tsx   Draws the paint layers on the bed
  src/components/DrawingPanel.tsx  Upload, placement, layer list
  src/placement.ts          Drawing placement on the bed (offset + scale)
projects/                   Saved paintings / well layouts (JSON), git-ignored
```

- **`./dev.sh`**: development mode. API with auto-reload on :8000 and the Vite dev server with
  hot reload on **http://localhost:5180** (proxies `/api`). Ctrl+C stops both.
  (Port 5173 is taken by another local project.)
- **`./run.sh`**: production mode. Builds the frontend, then FastAPI serves app + API on
  **http://localhost:8000**.
- Both scripts install dependencies if they are missing (`uv sync`, `npm ci`).
- Backend only: `cd backend && uv run uvicorn paint_plotter.main:app --reload` (port 8000)
- Backend tests: `cd backend && uv run pytest`
- Frontend checks: `cd frontend && npm run build && npm run lint`
- Config path can be overridden with the env var `PAINT_PLOTTER_CONFIG`.
- The config validator enforces the Z rule (`z.up > 1`, `z.down <= 0`).

## Concept

1. **Load and show an SVG** in the browser: paths, fills, strokes and colors.
2. **Define color reference areas.** These are physical positions on the plotter bed
   where paint colors are placed (wells or palettes). Each area has a position, a size
   and the color it holds.
3. **Map SVG colors to reference areas.** Each color in the drawing is assigned to
   (or matched with) one of the available paint areas.
4. **Plan the painting.** For each color, the brush goes to its reference area, picks up
   paint, paints a stretch of strokes, and goes back to reload when the paint runs low.
5. **Generate G-code** for the plotter.
   - **One painting can produce several G-code files.** A new file starts wherever a manual
     step is needed (tool swap, brush change, paint refill, cleaning). Files are numbered in
     order (e.g. `01_layout_pencil.gcode`, `02_red_brush.gcode`, …) and the app shows a
     list of the steps: which file to run, and what to do before it.

## Architecture (planned)

- **Frontend:** a local web app that runs in the browser, built with **React + Ant Design (antd)** in **TypeScript**.
  Uses **Vite** as the build tool. During development the Vite dev server proxies `/api` to FastAPI.
  For normal use, the frontend is built once and FastAPI serves the built files, so
  one command starts the whole app.
  - SVG viewer (zoom and pan, color layers)
  - Editor for the reference areas on the plotter bed
  - Color mapping UI
  - Toolpath and G-code preview or simulation
- **Backend:** a Python API that runs locally. **Python was chosen because of
  [vpype](https://github.com/abey79/vpype)**, which is used for the vector work: reading
  SVGs and splitting them into layers by color, path merging/sorting/simplifying, and
  unit/page handling. Check the vpype plugins (e.g. for G-code export or hatching)
  before writing our own.
  **Web framework: FastAPI** (run with uvicorn). It also serves the built frontend,
  so one command starts the whole app on localhost. Its auto-generated API docs
  at `/docs` are used for testing.
  - SVG parsing and path flattening
  - Color extraction and matching
  - Toolpath planning (paint pickup, stroke splitting, reload intervals)
  - G-code generation and export (several files per painting)
  - Project and config storage (plotter settings, palette layout)
- **Local only, no security:** a single user on localhost. No authentication, user
  accounts, HTTPS or access control. Keep it simple.

## Plotter hardware

- **Work area:** 500 × 500 mm by default. The size **can be changed in a config file**
  (e.g. `config/plotter.json`) and must not be hard-coded. The drawing area and the
  paint wells (reference areas) must both fit inside it.
- **Machine:** a self-built plotter running **Marlin** firmware, so the export uses Marlin G-code
  (G0/G1, G28, G90, G21, M0/M400 for pauses, etc.).
- **Sender:** paintings are run with **CNCjs**. The app **only exports G-code files**,
  and the user loads them into CNCjs. The app does not need its own serial or USB
  connection.
- **Pauses = separate files.** The G-code files never contain pause commands (no `M0`/`M6`).
  Wherever a pause is needed (tool swap, paint refill, rinsing by hand, etc.), the
  painting is **split into separate G-code files**. Each file ends with the tool up
  in a safe position, and the user does the manual step between files.
- **Z axis (custom):** Z is **only** an up/down switch, not a real height. There is no pressure control:
  - `Z > 1` → tool **up**
  - `Z <= 0` → tool **down**
  - The up and down values go in the config (e.g. `z_up: 2`, `z_down: 0`) and are not hard-coded.
- **Soft limits:** the app refuses or flags any move outside the configured work area.
- **Tool holder:** one holder takes any brush or a pencil. Tools are **swapped by hand**,
  and each tool change starts a new G-code file (e.g. pencil layout file → swap → brush file).
- **Origin:** (0,0) is at the **bottom left**. X increases to the right and Y increases away
  from the origin (assumed). SVG puts its origin at the top left with Y pointing down, so
  the G-code export has to flip Y: `y_plotter = height - y_svg` (after scaling).

## Painting logic (core of the program)

How SVG colors become paint and how areas get filled is **not a fixed spec**. It is the
main thing this program is for, and it **will be developed over time**. Start simple
and keep it easy to change and add to (e.g. fill patterns as plug-in strategies).

Starting parameters for a painting:
- **Brush size:** stroke width in mm. Sets the spacing of fill lines.
- **Paint distance per dip:** how many mm the brush paints after fresh paint before
  it has to go back to its well (the "stroke budget").
- **Fill pattern:** how filled areas are painted (e.g. parallel hatching first; more
  patterns added later).

Color handling also starts simple (e.g. assigning each SVG color to a well by hand) and
improves over time.

**Design principle: behaviors are options in menus.** Wherever there are several ways to
do something (fill pattern, color handling, cleaning, ...), the UI offers them as
selectable options with their own parameters, not as one hard-coded behavior.
Start with the simplest option and add more over time.

Brush cleaning between colors is also still being developed. Planned options:
- **None / manual (start here):** no cleaning in the G-code. Swapping or washing the
  brush is a manual step between files.
- **Water well (later):** a well of type "water". The brush dips in it and makes
  **circles** to rinse (parameters such as number of circles and radius), possibly
  followed by wiping or drying.

## Paint well setup workflow

The paint wells sit inside the work area. They are placed on the plotter
with a pencil template:

1. **Define the wells in the app.** Set each well's position, size and shape on the
   virtual bed, plus the paint color it will hold. Wells **can be any size**.
2. **Put paper on the plotter.**
3. **Plot the well outlines with a pencil.** The app generates a separate
   "well layout" G-code file that draws each well's outline and, ideally, a label or color marker.
   It also draws the **boundary of the painting area** and **registration marks**.
4. **Place the physical wells** on the pencil outlines.

The plotter then knows exactly where each well is, because the coordinates in the app
are the ones the pencil drew. The well layout counts as one of the several G-code files
a painting can produce.

Consequences:
- The painting area and the wells share the bed, so the app must stop strokes from
  overlapping the wells (and keep some margin).
- A well layout should be saved and reusable across paintings, so the wells don't
  have to be redrawn every time.

## SVG import (how it works)

- vpype reads the SVG (curves flattened to ≤ 0.1 mm segments) grouped by fill, stroke and stroke-width.
- Each group becomes **paint layers** by kind: a **fill** layer (an area to paint) and/or a
  **stroke** layer (a line). A blue circle with a black outline gives `fill-#0000ff` and
  `stroke-#000000-…`. Layers with the same kind, color and width are merged and kept in SVG order.
- SVG defaults apply: fill is black when missing, stroke is none.
- `none` paints nothing. Gradients (`url(...)`) and `currentColor` are ignored **with a
  warning** (vpype would otherwise silently turn them black).
- Coordinates come back in mm with Y already flipped (origin bottom left of the SVG page).
  The placement on the bed (x, y = bottom left corner, uniform scale) is applied on top of that.
- For now the SVG is not stored on the server. The frontend keeps it in memory, and saving
  comes with projects.

## Defaults (can be changed later)

- **Feed rates:** separate speeds for travel (brush up) and painting (brush down), set in `config/plotter.json`.
- **SVG placement:** the drawing is scaled and positioned in the app inside the painting area.
- **Dipping:** move to the well's centre, lower the brush, optionally move it a little, lift.
  This is a menu option with parameters.
- **Storage:** projects and well layouts are saved as JSON files in `projects/`. No database.
- **Python tooling:** `uv`. **Version control:** git.

## Domain terms

- **Painting:** one project, made of an SVG plus its settings, which produces one or more G-code files.
- **Reference area / well:** a physical spot on the bed. It is usually a **paint well** (holds one
  color). Later it can also be a **water well** for cleaning the brush.
- **Well layout:** a saved set of wells (positions, sizes, colors) and the pencil G-code that marks them on paper.
- **Dip / reload:** the brush moves to a reference area to pick up paint.
- **Stroke budget:** how far the brush can paint before it needs a reload.

## Roadmap (draft)

1. ✅ Project setup: Python API and web frontend, both running locally
2. ✅ SVG upload and visualization
3. Defining wells on a virtual bed (size from config), then exporting the pencil "well layout" G-code
4. Color mapping from SVG colors to reference areas
5. Toolpath planning: fill pattern, brush size, reloading after N mm of painting
6. G-code generation, with several files per painting
7. Preview and simulation of the G-code
8. Testing on the real plotter via CNCjs, then calibration
9. (Later, optional) Send files straight to CNCjs through its API

## Open questions

None at the moment. Add new ones here as they come up.
