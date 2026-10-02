import { Alert, Button, Card, Empty, Flex, Form, InputNumber, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { CompressOutlined, ExpandOutlined, FileImageOutlined } from '@ant-design/icons'
import type { PaintLayer, Rect, SvgDrawing } from '../api'
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

      <Card size="small" title="Placement">
        <Form layout="vertical" size="small">
          <Form.Item label="Position of bottom-left corner" style={{ marginBottom: 8 }}>
            <Space.Compact block>
              <InputNumber
                prefix="X"
                suffix="mm"
                value={placement.x}
                onChange={(v) => onPlacementChange({ ...placement, x: v ?? 0 })}
                style={{ width: '50%' }}
              />
              <InputNumber
                prefix="Y"
                suffix="mm"
                value={placement.y}
                onChange={(v) => onPlacementChange({ ...placement, y: v ?? 0 })}
                style={{ width: '50%' }}
              />
            </Space.Compact>
          </Form.Item>
          <Form.Item label="Scale" style={{ marginBottom: 8 }}>
            <Space.Compact block>
              <InputNumber
                value={placement.scale}
                min={0.001}
                step={0.1}
                onChange={(v) => onPlacementChange({ ...placement, scale: v ?? 1 })}
                style={{ width: '40%' }}
              />
              <Tooltip title="Center on the bed at this scale">
                <Button icon={<CompressOutlined />} onClick={() => onPlacementChange(centered(drawing, placement.scale, area))}>
                  Center
                </Button>
              </Tooltip>
              <Tooltip title="Largest scale that fits the bed, centered">
                <Button
                  icon={<ExpandOutlined />}
                  onClick={() => onPlacementChange(centered(drawing, fitScale(drawing, area), area))}
                >
                  Fit
                </Button>
              </Tooltip>
            </Space.Compact>
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">
          {drawing.width_mm} × {drawing.height_mm} mm in the SVG → {placed.width_mm.toFixed(1)} ×{' '}
          {placed.height_mm.toFixed(1)} mm on the bed
        </Typography.Text>
        {!rectInside(placed, area) && (
          <Alert style={{ marginTop: 8 }} type="error" showIcon title="Drawing is outside the work area" />
        )}
      </Card>

      <Card size="small" title="Layers" styles={{ body: { padding: 0 } }}>
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
                l.kind === 'fill' ? <Tag color="blue">fill</Tag> : <Tag>line {l.stroke_width_mm} mm</Tag>,
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
      </Card>
    </Flex>
  )
}
