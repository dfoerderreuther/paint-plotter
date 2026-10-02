// Types mirror the backend's pydantic models (backend/src/paint_plotter/).

export interface PlotterConfig {
  work_area: { width_mm: number; height_mm: number }
  z: { up: number; down: number }
  feed_rates: { travel_mm_min: number; paint_mm_min: number }
  park: { x_mm: number; y_mm: number }
}

export type Point = [number, number]

/** Coordinates in mm, origin bottom left of the SVG page, Y up. */
export interface PaintLayer {
  id: string
  kind: 'fill' | 'stroke'
  color: string
  stroke_width_mm: number | null
  paths: Point[][]
  length_mm: number
}

export interface SvgDrawing {
  width_mm: number
  height_mm: number
  layers: PaintLayer[]
  warnings: string[]
}

/** Axis-aligned rectangle, (x, y) = bottom left corner, mm. */
export interface Rect {
  x: number
  y: number
  width_mm: number
  height_mm: number
}

export type WellShape = 'cross' | 'circle' | 'rect'

export interface Well {
  id: string
  name: string
  color: string
  shape: WellShape
  /** Centre, mm. */
  x: number
  y: number
  /** Cross: arm length. Circle: diameter. Rect: width. */
  width_mm: number
  /** Rect only. */
  height_mm: number
}

export interface WellLayout {
  name: string
  palette: Rect | null
  margin_mm: number
  wells: Well[]
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `${res.url}: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const fetchConfig = () => fetch('/api/config').then((r) => parse<PlotterConfig>(r))

export function uploadSvg(file: File): Promise<SvgDrawing> {
  const body = new FormData()
  body.append('file', file)
  return fetch('/api/svg', { method: 'POST', body }).then((r) => parse<SvgDrawing>(r))
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const layoutUrl = (name: string) => `/api/well-layouts/${encodeURIComponent(name)}`

export const listWellLayouts = () => fetch('/api/well-layouts').then((r) => parse<string[]>(r))
export const getWellLayout = (name: string) => fetch(layoutUrl(name)).then((r) => parse<WellLayout>(r))
export const saveWellLayout = (layout: WellLayout) =>
  fetch(layoutUrl(layout.name), json('PUT', layout)).then((r) => parse<WellLayout>(r))
export const deleteWellLayout = async (name: string): Promise<true> => {
  const res = await fetch(layoutUrl(name), { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  return true
}
export const checkWellLayout = (layout: WellLayout) =>
  fetch('/api/well-layouts/check', json('POST', layout)).then((r) => parse<{ warnings: string[] }>(r))
/** Palette page in the corner opposite the placed drawing, one cross per color. */
export const arrangeWellLayout = (layout: WellLayout, colors: string[], drawing: Rect | null) =>
  fetch('/api/well-layouts/arrange', json('POST', { layout, colors, drawing })).then((r) => parse<WellLayout>(r))

/** Hands a blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** POSTs `body` and downloads the response under the server's filename. */
async function downloadPost(url: string, body: unknown, fallback: string): Promise<string> {
  const res = await fetch(url, json('POST', body))
  if (!res.ok) await parse(res)
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallback
  saveBlob(await res.blob(), filename)
  return filename
}

export const downloadWellLayoutGcode = (layout: WellLayout) =>
  downloadPost('/api/well-layouts/gcode', layout, 'layout.gcode')

export interface ColorMatch {
  color: string
  best_well_id: string | null
  /** CIE76 ΔE from the color to each well, by well id. */
  distances: Record<string, number>
}

export const matchColors = (colors: string[], wells: Well[]) =>
  fetch('/api/colors/match', json('POST', { colors, wells })).then((r) => parse<ColorMatch[]>(r))

// ---------------------------------------------------------------- painting

export interface PaintSettings {
  brush_width_mm: number
  /** How far the brush paints per dip before it needs fresh paint. */
  paint_distance_mm: number
  fill: { pattern: 'hatch'; angle_deg: number; overlap: number; outline: boolean }
  dip: { mode: 'tap' | 'circle'; circle_radius_mm: number }
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  brush_width_mm: 3,
  paint_distance_mm: 150,
  fill: { pattern: 'hatch', angle_deg: 45, overlap: 0.2, outline: true },
  dip: { mode: 'tap', circle_radius_mm: 3 },
}

export interface PaintRequest {
  layers: PaintLayer[]
  placement: { x: number; y: number; scale: number }
  layout: WellLayout
  color_map: Record<string, string | null>
  settings: PaintSettings
}

export interface PaintFile {
  index: number
  filename: string
  well_id: string
  well_name: string
  well_color: string
  colors: string[]
  dips: number
  paint_length_mm: number
  travel_length_mm: number
  estimated_seconds: number
  /** Brush-down paths in machine coordinates, for the preview. */
  strokes: Point[][]
  gcode: string
}

export interface PaintPlan {
  files: PaintFile[]
  warnings: string[]
}

export const planPainting = (req: PaintRequest) =>
  fetch('/api/paint/plan', json('POST', req)).then((r) => parse<PaintPlan>(r))

/** Zip with the pencil layout (01), brush files (02…) and steps.txt. */
export const downloadPaintingZip = (req: PaintRequest) => downloadPost('/api/paint/export', req, 'painting.zip')
