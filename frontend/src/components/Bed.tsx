import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Button, Space, Tooltip, Typography, theme } from 'antd'
import { BorderOutlined, PictureOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
import type { Rect } from '../api'

interface BedProps {
  widthMm: number
  heightMm: number
  /** Placed drawing in machine coordinates, for "zoom to SVG". */
  drawingRect?: Rect | null
  /** Content in machine coordinates (mm, origin bottom left, Y up). */
  children?: ReactNode
}

/** Visible part of the outer SVG (Y down, y = height − machine y), in mm. */
interface View {
  x: number
  y: number
  w: number
  h: number
}

const PAD = 30 // mm around the work area in the full view
const MIN_VIEW_MM = 5
const DRAG_THRESHOLD_PX = 4

/**
 * The plotter's work area in machine coordinates (mm), with zoom (wheel, buttons) and pan (drag).
 * The plotter's origin is bottom left with Y up, SVG's is top left with Y down,
 * so all content goes inside a group that flips Y.
 */
export default function Bed({ widthMm, heightMm, drawingRect, children }: BedProps) {
  const { token } = theme.useToken()
  const full = useMemo<View>(
    () => ({ x: -PAD, y: -PAD, w: widthMm + 2 * PAD, h: heightMm + 2 * PAD }),
    [widthMm, heightMm],
  )
  const [view, setView] = useState<View>(full)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; panning: boolean } | null>(null)
  const justPanned = useRef(false)
  const [panning, setPanning] = useState(false)

  // Back to the full view when the work area changes.
  const [prevFull, setPrevFull] = useState(full)
  if (prevFull !== full) {
    setPrevFull(full)
    setView(full)
  }

  /** Client (screen) point → outer SVG coordinates. */
  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  /** Zoom by `factor` (< 1 zooms in) keeping the point (cx, cy) fixed. */
  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const maxW = full.w * 4
      const f = Math.min(Math.max(factor, MIN_VIEW_MM / v.w), maxW / v.w)
      const px = cx ?? v.x + v.w / 2
      const py = cy ?? v.y + v.h / 2
      return { x: px - (px - v.x) * f, y: py - (py - v.y) * f, w: v.w * f, h: v.h * f }
    })

  // Wheel zoom around the cursor (non-passive, so the page does not scroll).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toSvg(e.clientX, e.clientY)
      zoomAt(Math.exp(e.deltaY * 0.0015), p?.x, p?.y)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }) // re-binds each render so the handler sees the current `full`

  const fitRect = (r: { x: number; y: number; w: number; h: number }) => {
    const m = Math.max(r.w, r.h) * 0.06 + 2
    setView({ x: r.x - m, y: r.y - m, w: Math.max(r.w + 2 * m, MIN_VIEW_MM), h: Math.max(r.h + 2 * m, MIN_VIEW_MM) })
  }
  const fitDrawing = () =>
    drawingRect &&
    fitRect({
      x: drawingRect.x,
      y: heightMm - drawingRect.y - drawingRect.height_mm,
      w: drawingRect.width_mm,
      h: drawingRect.height_mm,
    })

  // Drag to pan; a click without movement still reaches wells etc.
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    justPanned.current = false // a new press: only the click right after a pan is swallowed
    drag.current = { x: e.clientX, y: e.clientY, view, panning: false }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const svg = svgRef.current
    if (!d || !svg) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.panning) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      d.panning = true
      setPanning(true)
      svg.setPointerCapture(e.pointerId)
    }
    const box = svg.getBoundingClientRect()
    const mmPerPx = 1 / Math.min(box.width / d.view.w, box.height / d.view.h) // viewBox "meet"
    setView({ ...d.view, x: d.view.x - dx * mmPerPx, y: d.view.y - dy * mmPerPx })
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.panning) {
      justPanned.current = true
      setPanning(false)
      svgRef.current?.releasePointerCapture(e.pointerId)
    }
    drag.current = null
  }

  // Sizes that should stay the same on screen whatever the zoom.
  const k = view.w / full.w
  const fine = view.w < 220
  const grid = (step: number) => ({
    xs: Array.from({ length: Math.floor(widthMm / step) + 1 }, (_, i) => i * step),
    ys: Array.from({ length: Math.floor(heightMm / step) + 1 }, (_, i) => i * step),
  })
  const major = grid(50)
  const minor = fine ? grid(10) : null
  const zoomPercent = Math.round(100 / k)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: panning ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (justPanned.current) {
            justPanned.current = false
            e.stopPropagation()
          }
        }}
      >
        <g transform={`translate(0 ${heightMm}) scale(1 -1)`}>
          <rect
            width={widthMm}
            height={heightMm}
            fill={token.colorBgContainer}
            stroke={token.colorBorder}
            vectorEffect="non-scaling-stroke"
          />
          {minor &&
            minor.xs.map((x) => (
              <line key={`mx${x}`} x1={x} y1={0} x2={x} y2={heightMm} stroke={token.colorFillQuaternary} vectorEffect="non-scaling-stroke" />
            ))}
          {minor &&
            minor.ys.map((y) => (
              <line key={`my${y}`} x1={0} y1={y} x2={widthMm} y2={y} stroke={token.colorFillQuaternary} vectorEffect="non-scaling-stroke" />
            ))}
          {major.xs.map((x) => (
            <line key={`x${x}`} x1={x} y1={0} x2={x} y2={heightMm} stroke={token.colorBorderSecondary} vectorEffect="non-scaling-stroke" />
          ))}
          {major.ys.map((y) => (
            <line key={`y${y}`} x1={0} y1={y} x2={widthMm} y2={y} stroke={token.colorBorderSecondary} vectorEffect="non-scaling-stroke" />
          ))}
          {children}
          <circle cx={0} cy={0} r={4 * k} fill={token.colorPrimary} />
        </g>
        {/* Labels outside the flipped group so text is not mirrored */}
        <text x={0} y={heightMm + 14 * k} fontSize={10 * k} fill={token.colorTextSecondary}>
          (0,0)
        </text>
        <text x={widthMm} y={heightMm + 14 * k} fontSize={10 * k} textAnchor="end" fill={token.colorTextSecondary}>
          {widthMm} mm
        </text>
        <text x={-4 * k} y={4 * k} fontSize={10 * k} textAnchor="end" fill={token.colorTextSecondary}>
          {heightMm}
        </text>
      </svg>

      <Space.Compact style={{ position: 'absolute', top: 0, right: 0, boxShadow: token.boxShadowTertiary }}>
        <Tooltip title="Zoom in">
          <Button icon={<ZoomInOutlined />} onClick={() => zoomAt(1 / 1.4)} />
        </Tooltip>
        <Tooltip title="Zoom out">
          <Button icon={<ZoomOutOutlined />} onClick={() => zoomAt(1.4)} />
        </Tooltip>
        <Tooltip title={drawingRect ? 'Zoom to SVG' : 'Load an SVG first'}>
          <Button icon={<PictureOutlined />} disabled={!drawingRect} onClick={fitDrawing}>
            SVG
          </Button>
        </Tooltip>
        <Tooltip title="Zoom to work area">
          <Button icon={<BorderOutlined />} onClick={() => setView(full)}>
            Work area
          </Button>
        </Tooltip>
        <Button disabled style={{ width: 64, cursor: 'default' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {zoomPercent}%
          </Typography.Text>
        </Button>
      </Space.Compact>
      <Typography.Text
        type="secondary"
        style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 11, pointerEvents: 'none' }}
      >
        Wheel: zoom · drag: pan
      </Typography.Text>
    </div>
  )
}
