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
  src/paint_plotter/wells.py   Well layouts: model, checks, palette arrange, pencil G-code, storage
  src/paint_plotter/gcode.py   GcodeWriter (Marlin, Z up/down, soft limits, ends parked)
  src/paint_plotter/colors.py  CIELAB ΔE color matching, POST /api/colors/match
  src/paint_plotter/projects.py  Project folders: create/load/save/rename/delete, SVG upload
  src/paint_plotter/painting.py  Brush paths + G-code per well, POST /api/paint/plan and /export (zip)
  tests/                    pytest (tests/data/sample.svg = test drawing)
config/plotter.json         Plotter config (work area, Z up/down, feed rates)
frontend/                   React + antd + TypeScript (Vite)
  src/api.ts                API types (mirror the pydantic models) and fetch helpers
  src/components/Bed.tsx    Work area in machine coordinates (origin bottom left)
  src/components/DrawingView.tsx   Draws the paint layers on the bed
  src/components/DrawingPanel.tsx  Drawing tab: placement, layer table (empty state → Load SVG)
  src/components/AppMenu.tsx       Header menu bar (File / Export / View dropdowns)
  src/components/LoadSvgModal.tsx  SVG upload modal
  src/components/LayoutModals.tsx  Open / Save-as well layout modals
  src/components/PlotterDrawer.tsx Plotter settings drawer (read-only)
  src/components/ColorsPanel.tsx   Colors tab: drawing color → well mapping, paint preview
  src/colorMap.ts           Resolves the color → well mapping (choices + auto match)
  src/components/PaintPanel.tsx    Paint tab: brush/fill/dip settings, generate, run order, downloads
  src/components/ToolpathView.tsx  Brush paths on the bed at brush width
  src/components/StatusBar.tsx      Bottom status bar (project + save state, colors, layout)
  src/components/ProjectModals.tsx  New / rename (name dialog) and open-project table
  src/placement.ts          Drawing placement on the bed (offset + scale)
  src/components/WellsPanel.tsx  Wells tab: palette, wells table, selected-well editor
  src/components/WellsView.tsx   Palette page and wells on the bed
data/                       git-ignored user data (see "Projects")
  projects/<name>/          project.json + drawing.svg per project
  well_layouts/<name>.json  reusable well layout library
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
- Saved data goes to `./data/` (override with `PAINT_PLOTTER_DATA`; tests use a temp dir).
- `config/plotter.json` → `park`: where every G-code file ends (tool up).

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

**Current default: a palette page with crosses.**

1. Load and place the drawing.
2. **"Arrange crosses from drawing"** (Wells tab) puts an **A4 palette page** in the bed
   corner **diagonally opposite the placed drawing** (top right if no drawing is loaded).
   It is portrait, or landscape if only landscape stays clear of the drawing. One
   **cross per drawing color** is spaced evenly on it, labelled "<n> <hex>" to the right
   of the cross. That way you can refill paint while the plotter paints elsewhere. The
   plotter is CoreXY.
3. Lay the A4 sheet on the bed and run the **pencil G-code** (`01_layout_<name>_pencil.gcode`).
   It draws only the crosses and their labels.
4. Put each paint onto its cross. **The brush picks up paint at the centre of the cross.**

**Automatic palette page:** when a drawing with colors is loaded and the layout has **no
palette page and no wells**, the app runs Arrange by itself (new SVG or fresh project). Existing
wells are never overridden, so "Remove page" with wells kept does not bring the page back.

Wells can also be **circle** or **rect** outlines (any size) for physical cups or pans,
edited by hand. Layouts can also be saved to the library `data/well_layouts/<name>.json` and reused.

**No painting-area concept.** The user takes care of where the paper, the palette and the
drawing lie, and an overlap between the palette and the drawing is **not** flagged.
The app only checks: wells, cross labels and the palette page are inside the work area,
wells are on the palette page, and wells are at least `margin_mm` (default 5) apart. For
checking, a cross counts as a circle the size of the cross (the paint spot).

## Projects

- One folder per project: `data/projects/<name>/` with `project.json` and `drawing.svg`.
  The folder name is `safe_name(name)`, and the real name is in `project.json`.
- `project.json` holds the original SVG file name, placement, hidden layers, color choices,
  paint settings and the **working well layout** (a copy; the layout library is separate), plus `updated`.
- **Autosave:** the frontend PUTs the project about 0.8 s after any change. The status bar shows
  Saved / Unsaved changes / Saving… / Save failed. Unsaved changes are detected by comparing the
  project JSON with the last saved one.
- **On start** the app opens the last project. Its name is in localStorage
  (`paint-plotter.last-project`), the only thing kept in the browser. Otherwise it opens
  **"default"**, creating it if needed.
- **Naming:** while a project is called "default", the header tag is orange with a hint.
  Loading an SVG into "default" opens Rename with the file name suggested.
- File menu: New / Open (table, newest first, with delete) / Rename project, and Load SVG
  into the project. Deleting the open project switches to "default".
- An uploaded SVG is parsed before it is stored, so a broken file never replaces a good one.
- The export zip is named after the project.

## Color mapping (drawing color → well)

- Mapping is **per drawing color** (a color's fill and line layers share one well).
- The backend gives the CIE76 ΔE (CIELAB, D65) from every drawing color to every well.
  **Auto** = the closest well. The user can pick a specific well, or **"Don't paint"**.
- Explicit choices are kept. A choice pointing to a deleted well falls back to Auto.
  Loading a new SVG resets the choices.
- Match quality tags: ΔE ≤ 2.3 exact, ≤ 10 close, ≤ 25 similar, else far.
- "Preview in paint colors" draws the drawing on the bed in the assigned wells' colors
  and hides unpainted colors.
- The color choices are saved with the project.

## Painting (brush paths and G-code)

`painting.py`, settings in `PaintSettings` (options, extend there):
- **Only visible layers** are painted (the frontend sends them). Colors mapped to
  "Don't paint" are skipped and listed in the notes.
- **One file per well** (`02_<well>_brush.gcode`, `03_…`, in drawing order of first
  appearance). A new well means a manual brush change or clean, so it goes in a new file.
- **Fill areas:** closed paths are combined nonzero-style. A ring nested an odd number of
  times is a hole, because vpype splits compound paths. The area is **shrunk by half the
  brush width** so the paint edge lands on the shape edge. Shapes thinner than the brush
  are painted along their edge instead.
- **Fill pattern `hatch`:** parallel lines at `angle_deg`, spaced `brush × (1 − overlap)`,
  in zig-zag order. Neighbouring lines are joined into one stroke when the connection stays
  inside the area. **`outline`** paints the shrunk outline first.
- **Fill pattern `contour`:** the shrunk outline, then the outline stepped inwards by the same
  spacing, ring by ring, until nothing is left. Each ring starts at the point nearest the previous
  end and is joined to it when the connection is short and inside the area (near-spiral, few lifts).
  After the last ring, one more ring half a brush further in closes any gap in the middle.
  `outline` and `angle_deg` don't apply.
- **Lines** (stroke layers): centre line only. A note appears if the line is > 1.5 × the brush width.
- **Order per file:** outlines (nearest neighbour) → hatch → lines (nearest neighbour).
- **Paint per dip:** dip at the start, then dip again every `paint_distance_mm` of painting.
  Strokes are cut at that point and continue there after the dip. Leftover paint carries
  over to the next stroke.
- **Restart overlap** (`dip.resume_overlap_mm`, default 0): when a cut stroke continues after a
  dip, the brush goes down this far back on the already painted part (following the path, also
  around corners), then paints overlap + paint-per-dip before the next dip. It is never applied
  before the start of a stroke, and never at the start of a new stroke.
- **Dip motion:** `tap` (down, up at the well centre) or `circle` (down, one circle of
  `circle_radius_mm`, back to the centre, up).
- Strokes are simplified to 0.05 mm, and moves outside the work area are refused (422 with message).
- **Copy G-code:** each file in the run order (pencil too) has a copy button, for example to paste
  into ncviewer.com for a preview. That site has no known API, so nothing is sent there automatically.
- **Export zip:** `01_layout_<name>_pencil.gcode` (if there are wells), the brush files, and
  `steps.txt` (what to do before each file). The time estimate uses only lengths and feed rates.
- Not yet: knockout of overlapping colors (paint under later shapes is not removed),
  more fill patterns, and painting order options.

## UI conventions

- **antd 6** components throughout: the header menu bar uses click-triggered `Dropdown`s
  (File: Load SVG, well layout New/Open/Save/Save as · Export: pencil G-code · View:
  plotter settings). Dialogs are `Modal`s, settings go in a `Drawer`, and the side panels use
  `Tabs` + `Card` + `Table` + vertical `Form`. A status bar sits at the bottom.
- Side panel tabs in workflow order: Drawing → Wells → Colors → Paint (narrow tab spacing, so
  all four fit in the 380 px panel).
- App state lives in `App.tsx`. Menu actions go through `onMenu`. Wells can be selected
  in the table or by clicking them on the bed.
- Avoid props that are deprecated in antd 6: `Alert message` → `title`, `Drawer width` → `size`,
  `Divider type` → `orientation`, `InputNumber addonBefore/After` → `prefix`/`suffix` or
  `Space.Compact`, `Card bordered` → `variant`, `destroyOnClose` → `destroyOnHidden`, and
  `List` (deprecated) → `Table` or `Flex`. Check the browser console for antd warnings after UI changes.
- Browser automation note: in a background tab, antd's enter animations can stay stuck
  at the start (invisible). Check the DOM rather than trusting the screenshot.

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
- The uploaded SVG is stored in the project folder (`drawing.svg`) and re-read on load.

## Defaults (can be changed later)

- **Feed rates:** separate speeds for travel (brush up) and painting (brush down), set in `config/plotter.json`.
- **SVG placement:** the drawing is scaled and positioned in the app inside the work area.
- **Dipping:** move to the well's centre, lower the brush, optionally move it a little, lift.
  This is a menu option with parameters.
- **Storage:** projects and well layouts are saved as files in `./data/`. No database.
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
3. ✅ Wells: palette page with crosses (auto-arranged), saved layouts, pencil "well layout" G-code
4. ✅ Color mapping from SVG colors to wells (Colors tab)
5. ✅ Toolpath planning: fill pattern, brush size, reloading after N mm of painting
6. ✅ G-code generation, with several files per painting (zip with steps.txt)
7. Preview and simulation of the G-code
8. Testing on the real plotter via CNCjs, then calibration
9. (Later, optional) Send files straight to CNCjs through its API

## Open questions

None at the moment. Add new ones here as they come up.
