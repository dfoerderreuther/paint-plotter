import type { ReactNode } from 'react'
import { theme } from 'antd'

interface BedProps {
  widthMm: number
  heightMm: number
  gridMm?: number
  /** Content in machine coordinates (mm, origin bottom left, Y up). */
  children?: ReactNode
}

/**
 * The plotter's work area, drawn in machine coordinates (mm).
 * The plotter's origin is bottom left with Y up, SVG's is top left with Y down,
 * so all content goes inside a group that flips Y.
 */
export default function Bed({ widthMm, heightMm, gridMm = 50, children }: BedProps) {
  const { token } = theme.useToken()
  const xs = Array.from({ length: Math.floor(widthMm / gridMm) + 1 }, (_, i) => i * gridMm)
  const ys = Array.from({ length: Math.floor(heightMm / gridMm) + 1 }, (_, i) => i * gridMm)
  const pad = 30

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${widthMm + 2 * pad} ${heightMm + 2 * pad}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <g transform={`translate(0 ${heightMm}) scale(1 -1)`}>
        <rect width={widthMm} height={heightMm} fill={token.colorBgContainer} stroke={token.colorBorder} />
        {xs.map((x) => (
          <line key={`x${x}`} x1={x} y1={0} x2={x} y2={heightMm} stroke={token.colorBorderSecondary} strokeWidth={0.5} />
        ))}
        {ys.map((y) => (
          <line key={`y${y}`} x1={0} y1={y} x2={widthMm} y2={y} stroke={token.colorBorderSecondary} strokeWidth={0.5} />
        ))}
        {children}
        <circle cx={0} cy={0} r={4} fill={token.colorPrimary} />
      </g>
      {/* Labels outside the flipped group so text is not mirrored */}
      <text x={0} y={heightMm + 14} fontSize={10} fill={token.colorTextSecondary}>
        (0,0)
      </text>
      <text x={widthMm} y={heightMm + 14} fontSize={10} textAnchor="end" fill={token.colorTextSecondary}>
        {widthMm} mm
      </text>
      <text x={-4} y={4} fontSize={10} textAnchor="end" fill={token.colorTextSecondary}>
        {heightMm}
      </text>
    </svg>
  )
}
