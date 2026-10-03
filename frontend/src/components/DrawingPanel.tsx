import { Alert, Button, Empty, Flex, Form, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { CompressOutlined, ExpandOutlined, FileImageOutlined } from '@ant-design/icons'
import type { PaintLayer, Rect, SvgDrawing } from '../api'
import { Field, FieldRow, Num } from './form'
import Section from './Section'
import { centered, fitScale, placedRect, rectInside, type Placement } from '../placement'

interface DrawingPanelProps {
  drawing: SvgDrawing | null
  onLoadClick: () => void
  placement: Placement
  onPlacementChange: (p: Placement) => void
  hidden: Set<string>
  onToggleLayer: (id: string, visible: boolean) => void
  /** Where the drawing has to fit (the work area). */
  area: Rect
}

export function Swatch({ color, kind = 'fill' }: { color: string; kind?: PaintLayer['kind'] }) {
  const style =
    kind === 'fill' ? { background: color, border: '1px solid #0002' } : { border: `3px solid ${color}` }
  return <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 3, flex: 'none', ...style }} />
}

export default function DrawingPanel(props: DrawingPanelProps) {
  const { drawing, placement, onPlacementChange, area } = props

  if (!drawing) {
    return (
      <Empty description="No drawing loaded" style={{ marginTop: 48 }}>
        <Button type="primary" icon={<FileImageOutlined />} onClick={props.onLoadClick}>
          Load SVG
        </Button>
      </Empty>
    )
  }

  const placed = placedRect(drawing, placement)

  return (
    <Flex vertical gap={12}>
      {drawing.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Some SVG content was skipped"
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {drawing.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <Section id="drawing-placement" title="Placement">
        <Form layout="vertical" size="small">
          <FieldRow>
            <Field label="X" tooltip="Distance of the drawing's bottom-left corner from the bed's left edge (origin at the bottom left).">
              <Num suffix="mm" value={placement.x} onChange={(v) => onPlacementChange({ ...placement, x: v ?? 0 })} />
            </Field>
            <Field label="Y" tooltip="Distance of the drawing's bottom-left corner from the bed's bottom edge.">
              <Num suffix="mm" value={placement.y} onChange={(v) => onPlacementChange({ ...placement, y: v ?? 0 })} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Scale" tooltip="Size on the bed relative to the SVG's own size in mm. 1 = as in the SVG, 2 = twice as large.">
              <Num min={0.001} step={0.1} value={placement.scale} onChange={(v) => onPlacementChange({ ...placement, scale: v ?? 1 })} />
            </Field>
            <Field label="Quick placement" tooltip="Center: centre on the bed at the current scale. Fit: largest scale that fits the bed, centred.">
              <Space.Compact block>
                <Button
                  icon={<CompressOutlined />}
                  style={{ width: '50%' }}
                  onClick={() => onPlacementChange(centered(drawing, placement.scale, area))}
                >
                  Center
                </Button>
                <Button
                  icon={<ExpandOutlined />}
                  style={{ width: '50%' }}
                  onClick={() => onPlacementChange(centered(drawing, fitScale(drawing, area), area))}
                >
                  Fit
                </Button>
              </Space.Compact>
            </Field>
          </FieldRow>
        </Form>
        <Typography.Text type="secondary">
          {drawing.width_mm} × {drawing.height_mm} mm in the SVG → {placed.width_mm.toFixed(1)} ×{' '}
          {placed.height_mm.toFixed(1)} mm on the bed
        </Typography.Text>
        {!rectInside(placed, area) && (
          <Alert style={{ marginTop: 8 }} type="error" showIcon title="Drawing is outside the work area" />
        )}
      </Section>

      <Section id="drawing-layers" title="Layers" flush>
        <Table<PaintLayer>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={drawing.layers}
          locale={{ emptyText: 'No paintable layers found' }}
          columns={[
            {
              title: 'Color',
              key: 'color',
              render: (_, l) => (
                <Space size={6}>
                  <Swatch color={l.color} kind={l.kind} />
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {l.color}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: 'Type',
              key: 'kind',
              render: (_, l) =>
                l.kind === 'fill' ? <Tag color="purple">fill</Tag> : <Tag>line {l.stroke_width_mm} mm</Tag>,
            },
            {
              title: 'Length',
              key: 'length',
              align: 'right',
              render: (_, l) => (
                <Tooltip title={`${l.paths.length} ${l.paths.length === 1 ? 'path' : 'paths'}`}>
                  {(l.length_mm * placement.scale).toFixed(0)} mm
                </Tooltip>
              ),
            },
            {
              key: 'visible',
              align: 'right',
              render: (_, l) => (
                <Switch size="small" checked={!props.hidden.has(l.id)} onChange={(v) => props.onToggleLayer(l.id, v)} />
              ),
            },
          ]}
        />
      </Section>
    </Flex>
  )
}
