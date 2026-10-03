import {
  Alert,
  Button,
  ColorPicker,
  Empty,
  Flex,
  Form,
  Input,
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
import { Field, FieldRow, Num } from './form'
import Section from './Section'

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

/** Palette page position and size. */
function RectFields({ rect, onChange }: { rect: Rect; onChange: (r: Rect) => void }) {
  const set = (key: keyof Rect) => (v: number | null) => onChange({ ...rect, [key]: v ?? 0 })
  return (
    <Form layout="vertical" size="small">
      <FieldRow>
        <Field label="X" tooltip="Left edge of the palette sheet, in mm from the bed's left edge.">
          <Num suffix="mm" value={rect.x} onChange={set('x')} />
        </Field>
        <Field label="Y" tooltip="Bottom edge of the palette sheet, in mm from the bed's bottom edge.">
          <Num suffix="mm" value={rect.y} onChange={set('y')} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Width" tooltip="Width of the palette sheet (A4 portrait: 210 mm).">
          <Num suffix="mm" min={1} value={rect.width_mm} onChange={set('width_mm')} />
        </Field>
        <Field label="Height" tooltip="Height of the palette sheet (A4 portrait: 297 mm).">
          <Num suffix="mm" min={1} value={rect.height_mm} onChange={set('height_mm')} />
        </Field>
      </FieldRow>
    </Form>
  )
}

const SIZE_HELP: Record<WellShape, { label: string; tooltip: string }> = {
  cross: {
    label: 'Cross size',
    tooltip: 'Length of the cross arms. Also the size of the paint spot: wells closer than the margin are flagged.',
  },
  circle: { label: 'Diameter', tooltip: 'Diameter of the circle drawn for a round cup or pan.' },
  rect: { label: 'Width', tooltip: 'Width of the rectangle drawn for a square pan.' },
}

function WellEditor({ well, onChange, onDelete }: { well: Well; onChange: (w: Well) => void; onDelete: () => void }) {
  const size = SIZE_HELP[well.shape]
  return (
    <Form layout="vertical" size="small">
      <FieldRow>
        <Field label="Name" tooltip="Label written next to the cross (or inside the circle/rectangle) by the pencil file.">
          <Input value={well.name} onChange={(e) => onChange({ ...well, name: e.target.value })} />
        </Field>
        <Field label="Color" tooltip="The paint you put on this well. Drawing colors are matched to the closest well color.">
          <ColorPicker
            showText
            disabledAlpha
            value={well.color}
            onChangeComplete={(c) => onChange({ ...well, color: c.toHexString() })}
            style={{ width: '100%', justifyContent: 'flex-start' }}
          />
        </Field>
      </FieldRow>
      <Field
        label="Shape"
        tooltip="Cross: a pencil cross on the palette sheet, the paint is dabbed onto it. Circle / Rect: the outline of a physical cup or pan. The brush always dips at the centre."
      >
        <Segmented<WellShape> block options={SHAPES} value={well.shape} onChange={(shape) => onChange({ ...well, shape })} />
      </Field>
      <FieldRow>
        <Field label="X" tooltip="Centre of the well, in mm from the bed's left edge. The brush dips here.">
          <Num suffix="mm" value={well.x} onChange={(v) => onChange({ ...well, x: v ?? 0 })} />
        </Field>
        <Field label="Y" tooltip="Centre of the well, in mm from the bed's bottom edge.">
          <Num suffix="mm" value={well.y} onChange={(v) => onChange({ ...well, y: v ?? 0 })} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={size.label} tooltip={size.tooltip}>
          <Num
            suffix="mm"
            min={1}
            value={well.width_mm}
            onChange={(v) =>
              onChange({ ...well, width_mm: v ?? 1, height_mm: well.shape === 'rect' ? well.height_mm : (v ?? 1) })
            }
          />
        </Field>
        {well.shape === 'rect' && (
          <Field label="Height" tooltip="Height of the rectangle drawn for a square pan.">
            <Num suffix="mm" min={1} value={well.height_mm} onChange={(v) => onChange({ ...well, height_mm: v ?? 1 })} />
          </Field>
        )}
      </FieldRow>
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

      <Section
        id="wells-palette"
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
      </Section>

      <Section
        id="wells-list"
        title={`Wells (${layout.wells.length})`}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={addWell}>
            Add
          </Button>
        }
        flush
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
      </Section>

      {selected ? (
        <Section id="wells-edit" title={`Edit '${selected.name}'`}>
          <WellEditor
            well={selected}
            onChange={updateWell}
            onDelete={() => {
              onChange({ ...layout, wells: layout.wells.filter((x) => x.id !== selected.id) })
              onSelect(null)
            }}
          />
        </Section>
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
