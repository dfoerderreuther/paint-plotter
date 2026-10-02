import { Alert, Button, Flex, InputNumber, Space, Switch, Tag, Typography, Upload } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { PaintLayer, Rect, SvgDrawing } from '../api'
import { centered, fitScale, placedRect, rectInside, type Placement } from '../placement'

interface DrawingPanelProps {
  drawing: SvgDrawing | null
  fileName: string | null
  loading: boolean
  onUpload: (file: File) => void
  placement: Placement
  onPlacementChange: (p: Placement) => void
  hidden: Set<string>
  onToggleLayer: (id: string, visible: boolean) => void
  /** Where the drawing has to fit (the work area). */
  area: Rect
}

function Swatch({ layer }: { layer: PaintLayer }) {
  const style =
    layer.kind === 'fill'
      ? { background: layer.color, border: '1px solid #0002' }
      : { border: `3px solid ${layer.color}` }
  return <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 3, ...style }} />
}

export default function DrawingPanel(props: DrawingPanelProps) {
  const { drawing, placement, onPlacementChange, area } = props
  const placed = drawing && placedRect(drawing, placement)

  return (
    <Flex vertical gap={16}>
      <Upload.Dragger
        accept=".svg,image/svg+xml"
        showUploadList={false}
        disabled={props.loading}
        beforeUpload={(file) => {
          props.onUpload(file)
          return false
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{props.loading ? 'Reading SVG…' : 'Drop an SVG here or click'}</p>
        {props.fileName && <p className="ant-upload-hint">{props.fileName}</p>}
      </Upload.Dragger>

      {drawing && placed && (
        <>
          {drawing.warnings.map((w) => (
            <Alert key={w} type="warning" showIcon message={w} />
          ))}

          <div>
            <Typography.Title level={5}>Placement</Typography.Title>
            <Typography.Text type="secondary">
              SVG {drawing.width_mm} × {drawing.height_mm} mm → on bed {placed.width_mm.toFixed(1)} ×{' '}
              {placed.height_mm.toFixed(1)} mm
            </Typography.Text>
            <Flex gap={8} wrap style={{ marginTop: 8 }}>
              <InputNumber
                prefix="X"
                suffix="mm"
                value={placement.x}
                step={1}
                onChange={(v) => onPlacementChange({ ...placement, x: v ?? 0 })}
                style={{ width: 150 }}
              />
              <InputNumber
                prefix="Y"
                suffix="mm"
                value={placement.y}
                step={1}
                onChange={(v) => onPlacementChange({ ...placement, y: v ?? 0 })}
                style={{ width: 150 }}
              />
              <InputNumber
                prefix="Scale"
                value={placement.scale}
                min={0.001}
                step={0.1}
                onChange={(v) => onPlacementChange({ ...placement, scale: v ?? 1 })}
                style={{ width: 150 }}
              />
            </Flex>
            <Space style={{ marginTop: 8 }}>
              <Button onClick={() => onPlacementChange(centered(drawing, placement.scale, area))}>
                Center
              </Button>
              <Button
                onClick={() => onPlacementChange(centered(drawing, fitScale(drawing, area), area))}
              >
                Fit to bed
              </Button>
            </Space>
            {!rectInside(placed, area) && (
              <Alert style={{ marginTop: 8 }} type="error" showIcon message="Drawing is outside the work area" />
            )}
          </div>

          <div>
            <Typography.Title level={5}>Layers</Typography.Title>
            {drawing.layers.length === 0 && <Typography.Text type="secondary">No paintable layers found</Typography.Text>}
            <Flex vertical gap={4}>
              {drawing.layers.map((l) => (
                <Flex key={l.id} align="center" gap={10} style={{ padding: '6px 0', borderBottom: '1px solid #0000000f' }}>
                  <Swatch layer={l} />
                  <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                    <Space size={4}>
                      <Typography.Text code>{l.color}</Typography.Text>
                      <Tag color={l.kind === 'fill' ? 'blue' : 'default'}>
                        {l.kind === 'fill' ? 'fill' : `line ${l.stroke_width_mm} mm`}
                      </Tag>
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {l.paths.length} {l.paths.length === 1 ? 'path' : 'paths'} ·{' '}
                      {(l.length_mm * placement.scale).toFixed(0)} mm
                    </Typography.Text>
                  </Flex>
                  <Switch size="small" checked={!props.hidden.has(l.id)} onChange={(v) => props.onToggleLayer(l.id, v)} />
                </Flex>
              ))}
            </Flex>
          </div>
        </>
      )}
    </Flex>
  )
}
