import {
  Alert,
  App as AntApp,
  Button,
  Flex,
  Form,
  Segmented,
  Select,
  Space,
  Steps,
  Switch,
  Tooltip,
  Typography,
} from 'antd'
import { CopyOutlined, DownloadOutlined, FileZipOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { copyText, saveBlob, type PaintFile, type PaintPlan, type PaintSettings } from '../api'
import { Swatch } from './DrawingPanel'
import Section from './Section'
import { Field, FieldRow, Num, SwitchField } from './form'

interface PaintPanelProps {
  settings: PaintSettings
  onSettingsChange: (s: PaintSettings) => void
  plan: PaintPlan | null
  /** The drawing, wells, mapping or settings changed since the plan was made. */
  planOutdated: boolean
  generating: boolean
  canGenerate: string | null // reason why not, or null
  onGenerate: () => void
  onDownloadZip: () => void
  onSaveToProject: () => void
  onDownloadPencil: () => void
  /** Pencil G-code as text (for copying). */
  getPencilGcode: () => Promise<string>
  hasWells: boolean
  showToolpaths: boolean
  onShowToolpathsChange: (v: boolean) => void
}

const minutes = (s: number) => (s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`)

/** Download + copy-to-clipboard buttons for one G-code file (copy e.g. to paste into ncviewer.com). */
function FileButtons({ label, onDownload, getText }: { label: string; onDownload: () => void; getText: () => Promise<string> }) {
  const { message } = AntApp.useApp()
  const copy = async () => {
    try {
      await copyText(await getText())
      message.success(`Copied ${label} to the clipboard`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }
  return (
    <Space.Compact style={{ alignSelf: 'flex-start' }}>
      <Button size="small" icon={<DownloadOutlined />} onClick={onDownload}>
        {label}
      </Button>
      <Tooltip title="Copy G-code (e.g. to paste into ncviewer.com)">
        <Button size="small" icon={<CopyOutlined />} onClick={copy} />
      </Tooltip>
    </Space.Compact>
  )
}

function FileStep({ f }: { f: PaintFile }) {
  return (
    <Flex vertical gap={4}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Insert a clean brush, put paint on cross <b>{f.well_name}</b>, run the file.
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {f.dips} dips · {(f.paint_length_mm / 1000).toFixed(1)} m painted · ~{minutes(f.estimated_seconds)}
      </Typography.Text>
      <FileButtons
        label={f.filename}
        onDownload={() => saveBlob(new Blob([f.gcode], { type: 'text/plain' }), f.filename)}
        getText={async () => f.gcode}
      />
    </Flex>
  )
}

export default function PaintPanel(p: PaintPanelProps) {
  const s = p.settings
  const set = (patch: Partial<PaintSettings>) => p.onSettingsChange({ ...s, ...patch })
  const setFill = (patch: Partial<PaintSettings['fill']>) => set({ fill: { ...s.fill, ...patch } })
  const isDots = s.fill.pattern === 'dots'
  const overlapField = (
    <Field
      label="Overlap"
      tooltip={
        isDots
          ? 'How much neighbouring dots overlap, in % of the brush width. Hex covers fully from ~14 %, square from ~30 %; then leftover gaps are filled with extra dots. Below 0 % the dots are spaced apart on purpose (−100 % = one brush width of space) for lighter, shaded areas.'
          : 'How much neighbouring lines overlap, in % of the brush width. Line spacing = brush width × (1 − overlap). More overlap: denser, more even paint; less: faster.'
      }
    >
      <Num
        suffix="%"
        min={isDots ? -200 : 0}
        max={90}
        step={5}
        value={Math.round(s.fill.overlap * 100)}
        onChange={(v) => setFill({ overlap: (v ?? 0) / 100 })}
      />
    </Field>
  )
  const total = p.plan?.files.reduce((t, f) => t + f.estimated_seconds, 0) ?? 0

  return (
    <Flex vertical gap={12}>
      <Section id="paint-brush" title="Brush">
        <Form layout="vertical" size="small">
          <FieldRow>
            <Field
              label="Brush width"
              tooltip="Width of the paint stroke the brush leaves, in mm. Sets the spacing of fill lines and dots, and how far fills stay inside the shape edge (half of it)."
            >
              <Num suffix="mm" min={0.1} step={0.5} value={s.brush_width_mm} onChange={(v) => set({ brush_width_mm: v ?? 1 })} />
            </Field>
            <Field
              label="Paint per dip"
              tooltip="How many mm the brush paints before it goes back to its cross for fresh paint. A stroke that is cut continues exactly where it stopped. Dots use 'Dots per dip' instead."
            >
              <Num suffix="mm" min={1} step={10} value={s.paint_distance_mm} onChange={(v) => set({ paint_distance_mm: v ?? 100 })} />
            </Field>
          </FieldRow>
        </Form>
      </Section>

      <Section id="paint-fill" title="Fill">
        <Form layout="vertical" size="small">
          <Field
            label="Pattern"
            tooltip="How filled areas are painted. Hatch: parallel lines. Contour: the outline, then rings inwards until full. Dots: dabs on a regular grid. Lines in the drawing are always painted as strokes."
          >
            <Select<PaintSettings['fill']['pattern']>
              value={s.fill.pattern}
              options={[
                { value: 'hatch', label: 'Hatch (parallel lines)' },
                { value: 'contour', label: 'Contour (outline inwards)' },
                { value: 'dots', label: 'Dots (dabs)' },
              ]}
              onChange={(pattern) => setFill({ pattern })}
            />
          </Field>

          {s.fill.pattern === 'hatch' && (
            <>
              <FieldRow>
                <Field label="Angle" tooltip="Direction of the hatch lines: 0° horizontal, 90° vertical, 45° diagonal.">
                  <Num suffix="°" step={15} value={s.fill.angle_deg} onChange={(v) => setFill({ angle_deg: v ?? 0 })} />
                </Field>
                {overlapField}
              </FieldRow>
              <SwitchField
                label="Outline first"
                tooltip="Paint the shape's outline (half a brush inside the edge) before hatching it. Gives a clean edge."
                checked={s.fill.outline}
                onChange={(outline) => setFill({ outline })}
              />
            </>
          )}

          {s.fill.pattern === 'contour' && <FieldRow>{overlapField}</FieldRow>}

          {isDots && (
            <>
              <FieldRow>
                <Field
                  label="Grid"
                  tooltip="Layout of the dots. Hex: rows offset by half a dot, covers evenly from ~14 % overlap. Square: dots in straight rows and columns, needs ~30 %."
                >
                  <Segmented<PaintSettings['fill']['dot_grid']>
                    block
                    value={s.fill.dot_grid}
                    options={[
                      { value: 'hex', label: 'Hex' },
                      { value: 'square', label: 'Square' },
                    ]}
                    onChange={(dot_grid) => setFill({ dot_grid })}
                  />
                </Field>
                {overlapField}
              </FieldRow>
              <FieldRow>
                <Field
                  label="Jitter"
                  tooltip="Random offset of each dot up to ± this many mm, for a hand-painted look. The same settings always give the same dots. Jitter opens small gaps; more overlap closes them."
                >
                  <Num
                    prefix="±"
                    suffix="mm"
                    min={0}
                    step={0.25}
                    value={s.fill.dot_jitter_mm}
                    onChange={(v) => setFill({ dot_jitter_mm: v ?? 0 })}
                  />
                </Field>
                <Field label="Dots per dip" tooltip="The brush takes fresh paint after this many dots.">
                  <Num min={1} step={5} value={s.fill.dots_per_dip} onChange={(v) => setFill({ dots_per_dip: v ?? 1 })} />
                </Field>
              </FieldRow>
              <SwitchField
                label="Dots reach the edge"
                tooltip="On: dot centres may sit up to the shape's edge, so paint goes up to half a brush beyond it. Off: dots stay half a brush inside, so the paint stays within the shape."
                checked={s.fill.dots_to_edge}
                onChange={(dots_to_edge) => setFill({ dots_to_edge })}
              />
            </>
          )}
        </Form>
      </Section>

      <Section id="paint-dip" title="Dip">
        <Form layout="vertical" size="small">
          <FieldRow>
            <Field
              label="Motion"
              tooltip="What the brush does in the paint at its cross. Tap: down and up. Circle: down, one small circle to load more paint, up."
            >
              <Segmented<PaintSettings['dip']['mode']>
                block
                value={s.dip.mode}
                options={[
                  { value: 'tap', label: 'Tap' },
                  { value: 'circle', label: 'Circle' },
                ]}
                onChange={(mode) => set({ dip: { ...s.dip, mode } })}
              />
            </Field>
            {s.dip.mode === 'circle' && (
              <Field label="Circle radius" tooltip="Radius of the circle the brush makes in the paint, around the centre of the cross.">
                <Num
                  suffix="mm"
                  min={0.5}
                  step={0.5}
                  value={s.dip.circle_radius_mm}
                  onChange={(v) => set({ dip: { ...s.dip, circle_radius_mm: v ?? 3 } })}
                />
              </Field>
            )}
          </FieldRow>
          <FieldRow>
            <Field
              label="Restart overlap"
              tooltip="After a dip, a cut stroke restarts this far back on the part already painted, so there is no visible seam. Example: 2 mm and 15 mm paint per dip → back 2 mm, paint 2 + 15 mm, next dip. Not used at the start of a new stroke."
            >
              <Num
                suffix="mm"
                min={0}
                step={0.5}
                value={s.dip.resume_overlap_mm}
                onChange={(v) => set({ dip: { ...s.dip, resume_overlap_mm: v ?? 0 } })}
              />
            </Field>
          </FieldRow>
        </Form>
      </Section>

      <Tooltip title={p.canGenerate}>
        <Button
          type="primary"
          size="large"
          block
          icon={<ThunderboltOutlined />}
          loading={p.generating}
          disabled={!!p.canGenerate}
          onClick={p.onGenerate}
        >
          {p.plan ? 'Regenerate brush paths' : 'Generate brush paths'}
        </Button>
      </Tooltip>

      {p.plan && (
        <>
          {p.planOutdated && (
            <Alert type="info" showIcon title="Settings or drawing changed since the paths were generated." />
          )}
          {p.plan.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title="Notes"
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {p.plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              }
            />
          )}

          <Section
            id="paint-run-order"
            title={`Run order · ~${minutes(total)}`}
            extra={
              <Space size={6}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Preview
                </Typography.Text>
                <Switch size="small" checked={p.showToolpaths} onChange={p.onShowToolpathsChange} />
              </Space>
            }
          >
            <Steps
              orientation="vertical"
              size="small"
              current={-1}
              items={[
                ...(p.hasWells
                  ? [
                      {
                        title: '01 · Pencil: palette crosses',
                        content: (
                          <Flex vertical gap={4}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              Lay the palette sheet on the bed, insert the pencil, run the file.
                            </Typography.Text>
                            <FileButtons label="Pencil file" onDownload={p.onDownloadPencil} getText={p.getPencilGcode} />
                          </Flex>
                        ),
                      },
                    ]
                  : []),
                ...p.plan.files.map((f) => ({
                  title: (
                    <Space size={6}>
                      <Swatch color={f.well_color} />
                      {`${String(f.index).padStart(2, '0')} · Brush: ${f.well_name}`}
                    </Space>
                  ),
                  content: <FileStep f={f} />,
                })),
              ]}
            />
            <Flex vertical gap={8}>
              <Button block type="primary" ghost icon={<SaveOutlined />} onClick={p.onSaveToProject}>
                Save all in project folder
              </Button>
              <Button block icon={<FileZipOutlined />} onClick={p.onDownloadZip}>
                Download all (.zip with steps.txt)
              </Button>
            </Flex>
          </Section>
        </>
      )}
    </Flex>
  )
}
