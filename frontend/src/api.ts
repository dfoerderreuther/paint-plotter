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

export const wellLayoutGcodeText = async (layout: WellLayout): Promise<string> => {
  const res = await fetch('/api/well-layouts/gcode', json('POST', layout))
  if (!res.ok) await parse(res)
  return res.text()
}

/** Copies text to the clipboard (localhost counts as a secure context). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('Copy to clipboard failed')
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
  fill: {
    /** hatch: parallel lines at angle_deg. contour: outline, then step inwards ring by ring. dots: dabs on a grid. */
    pattern: 'hatch' | 'contour' | 'dots'
    angle_deg: number
    overlap: number
    /** Hatch only (contour always starts with the outline). */
    outline: boolean
    /** Dots only. */
    dot_grid: 'hex' | 'square'
    dot_jitter_mm: number
    /** Dots only: fresh paint after this many dots. */
    dots_per_dip: number
  }
  dip: {
    mode: 'tap' | 'circle'
    circle_radius_mm: number
    /** After a dip, restart this far back on the painted part of a cut stroke (not counted as paint per dip). */
    resume_overlap_mm: number
  }
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  brush_width_mm: 3,
  paint_distance_mm: 150,
  fill: {
    pattern: 'hatch',
    angle_deg: 45,
    overlap: 0.2,
    outline: true,
    dot_grid: 'hex',
    dot_jitter_mm: 0,
    dots_per_dip: 20,
  },
  dip: { mode: 'tap', circle_radius_mm: 3, resume_overlap_mm: 0 },
}

export interface PaintRequest {
  layers: PaintLayer[]
  placement: { x: number; y: number; scale: number }
  layout: WellLayout
  color_map: Record<string, string | null>
  settings: PaintSettings
  project_name?: string | null
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

// ---------------------------------------------------------------- projects

export interface Project {
  name: string
  svg_filename: string | null
  placement: { x: number; y: number; scale: number }
  hidden_layers: string[]
  color_choices: Record<string, string | null>
  paint_settings: PaintSettings
  layout: WellLayout
  updated?: string | null
}

export interface ProjectInfo {
  name: string
  updated: string | null
  svg_filename: string | null
}

export interface ProjectData {
  project: Project
  drawing: SvgDrawing | null
}

export class NotFoundError extends Error {}

const projectUrl = (name: string) => `/api/projects/${encodeURIComponent(name)}`

export const listProjects = () => fetch('/api/projects').then((r) => parse<ProjectInfo[]>(r))

export async function getProject(name: string): Promise<ProjectData> {
  const res = await fetch(projectUrl(name))
  if (res.status === 404) throw new NotFoundError(`Project '${name}' not found`)
  return parse<ProjectData>(res)
}

export const createProject = (name: string) =>
  fetch('/api/projects', json('POST', { name })).then((r) => parse<ProjectData>(r))
export const saveProject = (p: Project) => fetch(projectUrl(p.name), json('PUT', p)).then((r) => parse<Project>(r))
export const renameProject = (name: string, newName: string) =>
  fetch(`${projectUrl(name)}/rename`, json('POST', { name: newName })).then((r) => parse<Project>(r))
export const deleteProject = async (name: string): Promise<true> => {
  const res = await fetch(projectUrl(name), { method: 'DELETE' })
  if (!res.ok) await parse(res)
  return true
}

/** Writes all G-code files (and steps.txt) to data/projects/<name>/gcode/, replacing an older export. */
export const saveGcodeToProject = (name: string, req: PaintRequest) =>
  fetch(`${projectUrl(name)}/export`, json('POST', req)).then((r) => parse<{ folder: string; files: string[] }>(r))

/** Stores the SVG in the project folder and returns the parsed drawing. */
export function uploadProjectSvg(name: string, file: File): Promise<ProjectData> {
  const body = new FormData()
  body.append('file', file)
  return fetch(`${projectUrl(name)}/svg`, { method: 'POST', body }).then((r) => parse<ProjectData>(r))
}
