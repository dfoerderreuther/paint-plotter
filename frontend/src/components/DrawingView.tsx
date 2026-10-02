import type { PaintLayer, SvgDrawing } from '../api'
import type { Placement } from '../placement'

interface DrawingViewProps {
  drawing: SvgDrawing
  placement: Placement
  hidden: Set<string>
}

const toPathData = (layer: PaintLayer) =>
  layer.paths.map((pts) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L')).join('')

/** Renders the drawing's paint layers in machine coordinates (place inside <Bed>). */
export default function DrawingView({ drawing, placement, hidden }: DrawingViewProps) {
  return (
    <g transform={`translate(${placement.x} ${placement.y}) scale(${placement.scale})`}>
      <rect
        width={drawing.width_mm}
        height={drawing.height_mm}
        fill="none"
        stroke="#999"
        strokeDasharray="4 3"
        strokeWidth={0.5}
        vectorEffect="non-scaling-stroke"
      />
      {drawing.layers
        .filter((l) => !hidden.has(l.id))
        .map((l) =>
          l.kind === 'fill' ? (
            <path key={l.id} d={toPathData(l)} fill={l.color} fillRule="nonzero" />
          ) : (
            <path
              key={l.id}
              d={toPathData(l)}
              fill="none"
              stroke={l.color}
              strokeWidth={l.stroke_width_mm ?? 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ),
        )}
    </g>
  )
}
