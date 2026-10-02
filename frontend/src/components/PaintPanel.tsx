import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Flex,
  Form,
  InputNumber,
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
  const overlapInput = (width: string) => (
    <InputNumber
      suffix="% overlap"
      min={0}
      max={90}
      step={5}
      value={Math.round(s.fill.overlap * 100)}
      onChange={(v) => setFill({ overlap: (v ?? 0) / 100 })}
      style={{ width }}
    />
  )
  const total = p.plan?.files.reduce((t, f) => t + f.estimated_seconds, 0) ?? 0

  return (
    <Flex vertical gap={12}>
      <Card size="small" title="Brush">
        <Form layout="vertical" size="small">
          <Form.Item label="Brush width" style={{ marginBottom: 8 }}>
            <InputNumber
              suffix="mm"
              min={0.1}
              step={0.5}
              value={s.brush_width_mm}
              onChange={(v) => set({ brush_width_mm: v ?? 1 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            label="Paint per dip"
            tooltip="How far the brush paints before it goes back to its cross for fresh paint. Strokes continue where they stopped. (Dots use 'Dots per dip' instead.)"
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              suffix="mm"
              min={1}
              step={10}
              value={s.paint_distance_mm}
              onChange={(v) => set({ paint_distance_mm: v ?? 100 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card size="small" title="Fill">
        <Form layout="vertical" size="small">
          <Form.Item label="Pattern" style={{ marginBottom: 8 }}>
            <Select<PaintSettings['fill']['pattern']>
              value={s.fill.pattern}
              options={[
                { value: 'hatch', label: 'Hatch (parallel lines)' },
                { value: 'contour', label: 'Contour (outline inwards)' },
                { value: 'dots', label: 'Dots (dabs)' },
              ]}
              onChange={(pattern) => set({ fill: { ...s.fill, pattern } })}
            />
          </Form.Item>
          {s.fill.pattern === 'hatch' && (
            <>
              <Form.Item label="Angle and overlap" style={{ marginBottom: 8 }}>
                <Space.Compact block>
                  <InputNumber
                    suffix="°"
                    value={s.fill.angle_deg}
                    step={15}
                    onChange={(v) => setFill({ angle_deg: v ?? 0 })}
                    style={{ width: '50%' }}
                  />
                  {overlapInput('50%')}
                </Space.Compact>
              </Form.Item>
              <Space>
                <Switch size="small" checked={s.fill.outline} onChange={(outline) => setFill({ outline })} />
                <Typography.Text>Paint outline first</Typography.Text>
              </Space>
            </>
          )}
          {s.fill.pattern === 'contour' && (
            <Form.Item
              label="Overlap"
              tooltip="Starts with the outline, then steps inwards by brush width minus overlap until the area is painted."
              style={{ marginBottom: 0 }}
            >
              {overlapInput('100%')}
            </Form.Item>
          )}
          {s.fill.pattern === 'dots' && (
            <>
              <Form.Item
                label="Grid"
                tooltip="Hex closes the gaps from ~14 % overlap, square from ~30 %."
                style={{ marginBottom: 8 }}
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
              </Form.Item>
              <Form.Item label="Overlap and jitter" style={{ marginBottom: 8 }}>
                <Space.Compact block>
                  {overlapInput('50%')}
                  <Tooltip title="Random offset per dot for a hand-painted look (same every time)">
                    <InputNumber
                      prefix="±"
                      suffix="mm"
                      min={0}
                      step={0.25}
                      value={s.fill.dot_jitter_mm}
                      onChange={(v) => setFill({ dot_jitter_mm: v ?? 0 })}
                      style={{ width: '50%' }}
                    />
                  </Tooltip>
                </Space.Compact>
              </Form.Item>
              <Form.Item label="Dots per dip" tooltip="Fresh paint after this many dots." style={{ marginBottom: 0 }}>
                <InputNumber
                  min={1}
                  step={5}
                  value={s.fill.dots_per_dip}
                  onChange={(v) => setFill({ dots_per_dip: v ?? 1 })}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Card>

      <Card size="small" title="Dip">
        <Form layout="vertical" size="small">
          <Form.Item label="Motion in the paint" style={{ marginBottom: 8 }}>
            <Segmented<PaintSettings['dip']['mode']>
              block
              value={s.dip.mode}
              options={[
                { value: 'tap', label: 'Tap' },
                { value: 'circle', label: 'Circle' },
              ]}
              onChange={(mode) => set({ dip: { ...s.dip, mode } })}
            />
          </Form.Item>
          {s.dip.mode === 'circle' && (
            <Form.Item label="Circle radius" style={{ marginBottom: 8 }}>
              <InputNumber
                suffix="mm"
                min={0.5}
                step={0.5}
                value={s.dip.circle_radius_mm}
                onChange={(v) => set({ dip: { ...s.dip, circle_radius_mm: v ?? 3 } })}
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
          <Form.Item
            label="Restart overlap"
            tooltip="After a dip, a stroke continues this far back on the part already painted, then paints on. Example: 2 mm overlap and 15 mm paint per dip → back 2 mm, brush down, paint 2 + 15 mm, next dip. Not used at the start of a new stroke."
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              suffix="mm"
              min={0}
              step={0.5}
              value={s.dip.resume_overlap_mm}
              onChange={(v) => set({ dip: { ...s.dip, resume_overlap_mm: v ?? 0 } })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Card>

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

          <Card
            size="small"
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
          </Card>
        </>
      )}
    </Flex>
  )
}
