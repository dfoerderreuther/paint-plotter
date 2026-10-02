import type { SvgDrawing } from './api'

/** Where the drawing sits on the bed: its bottom-left corner in mm, and a uniform scale. */
export interface Placement {
  x: number
  y: number
  scale: number
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1 }

export function placedSize(drawing: SvgDrawing, p: Placement) {
  return { width: drawing.width_mm * p.scale, height: drawing.height_mm * p.scale }
}

export function centered(drawing: SvgDrawing, scale: number, bedW: number, bedH: number): Placement {
  return {
    x: round((bedW - drawing.width_mm * scale) / 2),
    y: round((bedH - drawing.height_mm * scale) / 2),
    scale,
  }
}

/** Largest scale that fits the bed, rounded down to 3 decimals. */
export function fitScale(drawing: SvgDrawing, bedW: number, bedH: number): number {
  return Math.floor(Math.min(bedW / drawing.width_mm, bedH / drawing.height_mm) * 1000) / 1000
}

export function fitsBed(drawing: SvgDrawing, p: Placement, bedW: number, bedH: number): boolean {
  const { width, height } = placedSize(drawing, p)
  const eps = 1e-6
  return p.x >= -eps && p.y >= -eps && p.x + width <= bedW + eps && p.y + height <= bedH + eps
}

const round = (v: number) => Math.round(v * 100) / 100
