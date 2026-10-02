import type { Rect, SvgDrawing } from './api'

/** Where the drawing sits on the bed: its bottom-left corner in mm, and a uniform scale. */
export interface Placement {
  x: number
  y: number
  scale: number
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 }

export function placedRect(drawing: SvgDrawing, p: Placement): Rect {
  return { x: p.x, y: p.y, width_mm: drawing.width_mm * p.scale, height_mm: drawing.height_mm * p.scale }
}

/** Centre the drawing in `area` at the given scale. */
export function centered(drawing: SvgDrawing, scale: number, area: Rect): Placement {
  return {
    x: round(area.x + (area.width_mm - drawing.width_mm * scale) / 2),
    y: round(area.y + (area.height_mm - drawing.height_mm * scale) / 2),
    scale,
  }
}

/** Largest scale that fits `area`, rounded down to 3 decimals. */
export function fitScale(drawing: SvgDrawing, area: Rect): number {
  return Math.floor(Math.min(area.width_mm / drawing.width_mm, area.height_mm / drawing.height_mm) * 1000) / 1000
}

export function rectInside(inner: Rect, outer: Rect): boolean {
  const eps = 1e-6
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width_mm <= outer.x + outer.width_mm + eps &&
    inner.y + inner.height_mm <= outer.y + outer.height_mm + eps
  )
}

const round = (v: number) => Math.round(v * 100) / 100
