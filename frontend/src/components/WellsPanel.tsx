import {
  Alert,
  Button,
  Card,
  ColorPicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { AppstoreAddOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Rect, Well, WellLayout, WellShape } from '../api'
import { Swatch } from './DrawingPanel'

interface WellsPanelProps {
  layout: WellLayout
  onChange: (layout: WellLayout) => void
  warnings: string[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Colors used in the loaded drawing, in order (for auto-arrange). */
  drawingColors: string[]
  onArrange: () => void
}

const SHAPES: { value: WellShape; label: string }[] = [
  { value: 'cross', label: 'Cross' },
  { value: 'circle', label: 'Circle' },
  { value: 'rect', label: 'Rect' },
]

function RectFields({ rect, onChange }: { rect: Rect; onChange: (r: Rect) => void }) {
  const num = (key: keyof Rect, prefix: string) => (
    <InputNumber
      prefix={prefix}
      suffix="mm"
      value={rect[key]}
      min={key.endsWith('_mm') ? 1 : undefined}
      onChange={(v) => onChange({ ...rect, [key]: v ?? 0 })}
      style={{ width: '50%' }}
    />
  )
  return (
    <Form layout="vertical" size="small">
      <Form.Item label="Position" style={{ marginBottom: 8 }}>
        <Space.Compact block>
          {num('x', 'X')}
          {num('y', 'Y')}
        </Space.Compact>
      </Form.Item>
      <Form.Item label="Size" style={{ marginBottom: 0 }}>
        <Space.Compact block>
          {num('width_mm', 'W')}
          {num('height_mm', 'H')}
        </Space.Compact>
      </Form.Item>
    </Form>
  )
}

function WellEditor({ well, onChange, onDelete }: { well: Well; onChange: (w: Well) => void; onDelete: () => void }) {
  const sizeLabel = well.shape === 'cross' ? 'Cross size' : well.shape === 'circle' ? 'Diameter' : 'Size'
  return (
    <Form layout="vertical" size="small">
      <Form.Item label="Name and color" style={{ marginBottom: 8 }}>
        <Space.Compact block>
          <ColorPicker disabledAlpha value={well.color} onChangeComplete={(c) => onChange({ ...well, color: c.toHexString() })} />
          <Input value={well.name} onChange={(e) => onChange({ ...well, name: e.target.value })} />
        </Space.Compact>
      </Form.Item>
      <Form.Item label="Shape" style={{ marginBottom: 8 }}>
        <Segmented<WellShape> block options={SHAPES} value={well.shape} onChange={(shape) => onChange({ ...well, shape })} />
      </Form.Item>
      <Form.Item label="Centre" style={{ marginBottom: 8 }}>
        <Space.Compact block>
          <InputNumber prefix="X" suffix="mm" value={well.x} onChange={(v) => onChange({ ...well, x: v ?? 0 })} style={{ width: '50%' }} />
          <InputNumber prefix="Y" suffix="mm" value={well.y} onChange={(v) => onChange({ ...well, y: v ?? 0 })} style={{ width: '50%' }} />
        </Space.Compact>
      </Form.Item>
      <Form.Item label={sizeLabel} style={{ marginBottom: 12 }}>
        <Space.Compact block>
          <InputNumber
            prefix={well.shape === 'rect' ? 'W' : undefined}
            suffix="mm"
            min={1}
            value={well.width_mm}
            onChange={(v) =>
              onChange({ ...well, width_mm: v ?? 1, height_mm: well.shape === 'rect' ? well.height_mm : (v ?? 1) })
            }
            style={{ width: well.shape === 'rect' ? '50%' : '100%' }}
          />
          {well.shape === 'rect' && (
            <InputNumber
              prefix="H"
              suffix="mm"
              min={1}
              value={well.height_mm}
              onChange={(v) => onChange({ ...well, height_mm: v ?? 1 })}
              style={{ width: '50%' }}
            />
          )}
        </Space.Compact>
      </Form.Item>
      <Popconfirm title={`Delete well '${well.name}'?`} okButtonProps={{ danger: true }} onConfirm={onDelete}>
        <Button danger block icon={<DeleteOutlined />}>
          Delete well
        </Button>
      </Popconfirm>
    </Form>
  )
}

export default function WellsPanel(props: WellsPanelProps) {
  const { layout, onChange, selectedId, onSelect } = props
  const selected = layout.wells.find((w) => w.id === selectedId) ?? null

  const updateWell = (w: Well) => onChange({ ...layout, wells: layout.wells.map((x) => (x.id === w.id ? w : x)) })
  const addWell = () => {
    const base = layout.palette ?? { x: 0, y: 0, width_mm: 100, height_mm: 100 }
    const well: Well = {
      id: crypto.randomUUID(),
      name: String(layout.wells.length + 1),
      color: '#888888',
      shape: 'cross',
      x: Math.round(base.x + base.width_mm / 2),
      y: Math.round(base.y + base.height_mm / 2),
      width_mm: 15,
      height_mm: 15,
    }
    onChange({ ...layout, wells: [...layout.wells, well] })
    onSelect(well.id)
  }

  return (
    <Flex vertical gap={12}>
      {props.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${props.warnings.length} layout ${props.warnings.length === 1 ? 'problem' : 'problems'}`}
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {props.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}

      <Card
        size="small"
        title="Palette page"
        extra={
          layout.palette && (
            <Button size="small" type="link" danger onClick={() => onChange({ ...layout, palette: null })}>
              Remove
            </Button>
          )
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          A4 sheet in the corner diagonally opposite the drawing, with one paint cross per drawing color.
        </Typography.Paragraph>
        <Tooltip title={props.drawingColors.length === 0 ? 'Load an SVG first' : undefined}>
          <Button
            type="primary"
            block
            icon={<AppstoreAddOutlined />}
            disabled={props.drawingColors.length === 0}
            onClick={props.onArrange}
          >
            Arrange crosses from drawing ({props.drawingColors.length} colors)
          </Button>
        </Tooltip>
        {layout.palette && (
          <div style={{ marginTop: 12 }}>
            <RectFields rect={layout.palette} onChange={(r) => onChange({ ...layout, palette: r })} />
          </div>
        )}
      </Card>

      <Card
        size="small"
        title={`Wells (${layout.wells.length})`}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={addWell}>
            Add
          </Button>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table<Well>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={layout.wells}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No wells" /> }}
          rowClassName={(w) => (w.id === selectedId ? 'ant-table-row-selected' : '')}
          onRow={(w) => ({ onClick: () => onSelect(w.id === selectedId ? null : w.id), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: 'Well',
              key: 'name',
              render: (_, w) => (
                <Space size={6}>
                  <Swatch color={w.color} />
                  {w.name}
                </Space>
              ),
            },
            { title: 'Shape', key: 'shape', render: (_, w) => <Tag>{w.shape}</Tag> },
            {
              title: 'Position',
              key: 'pos',
              align: 'right',
              render: (_, w) => (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {w.x.toFixed(0)}, {w.y.toFixed(0)}
                </Typography.Text>
              ),
            },
          ]}
        />
      </Card>

      {selected ? (
        <Card size="small" title={`Edit '${selected.name}'`}>
          <WellEditor
            well={selected}
            onChange={updateWell}
            onDelete={() => {
              onChange({ ...layout, wells: layout.wells.filter((x) => x.id !== selected.id) })
              onSelect(null)
            }}
          />
        </Card>
      ) : (
        layout.wells.length > 0 && (
          <Typography.Text type="secondary" style={{ textAlign: 'center' }}>
            Select a well in the table or on the bed to edit it.
          </Typography.Text>
        )
      )}
    </Flex>
  )
}
