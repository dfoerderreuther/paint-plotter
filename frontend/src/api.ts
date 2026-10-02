// Types mirror the backend's pydantic models (backend/src/paint_plotter/config.py).

export interface PlotterConfig {
  work_area: { width_mm: number; height_mm: number }
  z: { up: number; down: number }
  feed_rates: { travel_mm_min: number; paint_mm_min: number }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const fetchConfig = () => getJson<PlotterConfig>('/api/config')
