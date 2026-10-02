import { theme } from 'antd'
import type { Well, WellLayout } from '../api'

/** Text inside the Y-flipped bed group would be mirrored, so flip it back locally. */
function Label({ x, y, size, anchor, children }: { x: number; y: number; size: number; anchor: 'start' | 'middle'; children: string }) {
  return (
    <text
      transform={`translate(${x} ${y}) scale(1 -1)`}
      fontSize={size}
      textAnchor={anchor}
      dominantBaseline="central"
      fill="#555"
    >
      {children}
    </text>
  )
}

function WellMark({ well }: { well: Well }) {
  const { x, y, width_mm: w, height_mm: h, color } = well
  if (well.shape === 'cross') {
    const s = w / 2
    return (
      <g>
        <circle cx={x} cy={y} r={s} fill={color} fillOpacity={0.35} />
        <path d={`M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}`} stroke="#333" strokeWidth={0.6} />
        <Label x={x + s + 2} y={y + s} size={4} anchor="start">
          {well.name}
        </Label>
      </g>
    )
  }
  const shape =
    well.shape === 'circle' ? (
      <circle cx={x} cy={y} r={w / 2} fill={color} fillOpacity={0.35} stroke="#333" strokeWidth={0.6} />
    ) : (
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={color} fillOpacity={0.35} stroke="#333" strokeWidth={0.6} />
    )
  const inner = well.shape === 'circle' ? w : Math.min(w, h)
  return (
    <g>
      {shape}
      <Label x={x} y={y} size={Math.min(Math.max(inner * 0.25, 2), 6)} anchor="middle">
        {well.name}
      </Label>
    </g>
  )
}

/** Painting area, palette page and wells, in machine coordinates (place inside <Bed>). */
export default function WellsView({ layout }: { layout: WellLayout }) {
  const { token } = theme.useToken()
  const pa = layout.painting_area
  const pal = layout.palette
  return (
    <g>
      {pal && (
        <rect
          x={pal.x}
          y={pal.y}
          width={pal.width_mm}
          height={pal.height_mm}
          fill={token.colorFillQuaternary}
          stroke={token.colorBorder}
        />
      )}
      <rect
        x={pa.x}
        y={pa.y}
        width={pa.width_mm}
        height={pa.height_mm}
        fill="none"
        stroke={token.colorPrimary}
        strokeDasharray="6 4"
        strokeWidth={0.8}
      />
      {layout.wells.map((w) => (
        <WellMark key={w.id} well={w} />
      ))}
    </g>
  )
}
