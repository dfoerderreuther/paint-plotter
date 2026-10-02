import type { PaintPlan } from '../api'

interface ToolpathViewProps {
  plan: PaintPlan
  brushWidth: number
}

const toPathData = (strokes: [number, number][][]) =>
  strokes.map((pts) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L')).join('')

/** Brush-down paths of a painting plan, drawn at brush width (place inside <Bed>). */
export default function ToolpathView({ plan, brushWidth }: ToolpathViewProps) {
  return (
    <g opacity={0.85}>
      {plan.files.map((f) => (
        <path
          key={f.filename}
          d={toPathData(f.strokes)}
          fill="none"
          stroke={f.well_color}
          strokeWidth={brushWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* thin centre lines show the brush path itself */}
      {plan.files.map((f) => (
        <path key={`c-${f.filename}`} d={toPathData(f.strokes)} fill="none" stroke="#0006" strokeWidth={0.3} />
      ))}
    </g>
  )
}
