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

/** Fetches a G-code file and hands it to the browser as a download. */
export async function downloadWellLayoutGcode(layout: WellLayout): Promise<string> {
  const res = await fetch('/api/well-layouts/gcode', json('POST', layout))
  if (!res.ok) await parse(res)
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'layout.gcode'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}
