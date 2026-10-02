// Types mirror the backend's pydantic models (backend/src/paint_plotter/).

export interface PlotterConfig {
  work_area: { width_mm: number; height_mm: number }
  z: { up: number; down: number }
  feed_rates: { travel_mm_min: number; paint_mm_min: number }
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
