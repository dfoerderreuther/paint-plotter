import { useEffect, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  ColorPicker,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Typography,
} from 'antd'
import { DeleteOutlined, DownloadOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import {
  arrangeWellLayout,
  deleteWellLayout,
  downloadWellLayoutGcode,
  getWellLayout,
  listWellLayouts,
  saveWellLayout,
  type Rect,
  type Well,
  type WellLayout,
  type WellShape,
} from '../api'

interface WellsPanelProps {
  layout: WellLayout
  onChange: (layout: WellLayout) => void
  warnings: string[]
  /** Colors used in the loaded drawing, in order (for auto-arrange). */
  drawingColors: string[]
  /** Bounds of the placed drawing, if one is loaded. */
  drawingRect: Rect | null
}

function RectInputs({ rect, onChange }: { rect: Rect; onChange: (r: Rect) => void }) {
  const field = (key: keyof Rect, label: string) => (
    <InputNumber
      prefix={label}
      suffix="mm"
      value={rect[key]}
      min={key.endsWith('_mm') ? 1 : undefined}
      onChange={(v) => onChange({ ...rect, [key]: v ?? 0 })}
      style={{ width: 150 }}
    />
  )
  return (
    <Flex gap={8} wrap>
      {field('x', 'X')}
      {field('y', 'Y')}
      {field('width_mm', 'W')}
      {field('height_mm', 'H')}
    </Flex>
  )
}

function WellRow({ well, onChange, onDelete }: { well: Well; onChange: (w: Well) => void; onDelete: () => void }) {
  return (
    <Flex vertical gap={6} style={{ padding: '8px 0', borderBottom: '1px solid #0000000f' }}>
      <Flex gap={6} align="center">
        <ColorPicker
          size="small"
          disabledAlpha
          value={well.color}
          onChangeComplete={(c) => onChange({ ...well, color: c.toHexString() })}
        />
        <Input size="small" value={well.name} onChange={(e) => onChange({ ...well, name: e.target.value })} />
        <Select<WellShape>
          size="small"
          value={well.shape}
          style={{ width: 90 }}
          options={[
            { value: 'cross', label: 'Cross' },
            { value: 'circle', label: 'Circle' },
            { value: 'rect', label: 'Rect' },
          ]}
          onChange={(shape) => onChange({ ...well, shape })}
        />
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onDelete} />
      </Flex>
      <Flex gap={6} wrap>
        <InputNumber size="small" prefix="X" value={well.x} onChange={(v) => onChange({ ...well, x: v ?? 0 })} style={{ width: 90 }} />
        <InputNumber size="small" prefix="Y" value={well.y} onChange={(v) => onChange({ ...well, y: v ?? 0 })} style={{ width: 90 }} />
        <InputNumber
          size="small"
          prefix={well.shape === 'cross' ? 'Size' : well.shape === 'circle' ? 'Ø' : 'W'}
          min={1}
          value={well.width_mm}
          onChange={(v) => onChange({ ...well, width_mm: v ?? 1, height_mm: well.shape === 'rect' ? well.height_mm : (v ?? 1) })}
          style={{ width: 100 }}
        />
        {well.shape === 'rect' && (
          <InputNumber
            size="small"
            prefix="H"
            min={1}
            value={well.height_mm}
            onChange={(v) => onChange({ ...well, height_mm: v ?? 1 })}
            style={{ width: 90 }}
          />
        )}
      </Flex>
    </Flex>
  )
}

export default function WellsPanel({ layout, onChange, warnings, drawingColors, drawingRect }: WellsPanelProps) {
  const { message } = AntApp.useApp()
  const [saved, setSaved] = useState<string[]>([])

  const refresh = () => listWellLayouts().then(setSaved, (e: Error) => message.error(e.message))
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T,>(action: () => Promise<T>, ok?: (r: T) => string) => {
    try {
      const r = await action()
      if (ok) message.success(ok(r))
      return r
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const updateWell = (w: Well) => onChange({ ...layout, wells: layout.wells.map((x) => (x.id === w.id ? w : x)) })
  const addWell = () => {
    const base = layout.palette ?? layout.painting_area
    onChange({
      ...layout,
      wells: [
        ...layout.wells,
        {
          id: crypto.randomUUID(),
          name: String(layout.wells.length + 1),
          color: '#888888',
          shape: 'cross',
          x: Math.round(base.x + base.width_mm / 2),
          y: Math.round(base.y + base.height_mm / 2),
          width_mm: 15,
          height_mm: 15,
        },
      ],
    })
  }

  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={5}>Layout</Typography.Title>
        <Flex gap={8}>
          <Select
            placeholder="Load saved layout"
            style={{ flex: 1 }}
            value={null}
            options={saved.map((n) => ({ value: n, label: n }))}
            onChange={(name: string) => run(() => getWellLayout(name)).then((l) => l && onChange(l))}
          />
        </Flex>
        <Flex gap={8} style={{ marginTop: 8 }}>
          <Input value={layout.name} onChange={(e) => onChange({ ...layout, name: e.target.value })} prefix="Name" />
          <Button
            icon={<SaveOutlined />}
            disabled={!layout.name.trim()}
            onClick={() => run(() => saveWellLayout(layout), () => `Saved '${layout.name}'`).then(refresh)}
          >
            Save
          </Button>
          <Popconfirm
            title={`Delete saved layout '${layout.name}'?`}
            disabled={!saved.includes(layout.name)}
            onConfirm={() => run(() => deleteWellLayout(layout.name), () => 'Deleted').then(refresh)}
          >
            <Button danger icon={<DeleteOutlined />} disabled={!saved.includes(layout.name)} />
          </Popconfirm>
        </Flex>
      </div>

      <div>
        <Typography.Title level={5}>Painting area</Typography.Title>
        <RectInputs rect={layout.painting_area} onChange={(r) => onChange({ ...layout, painting_area: r })} />
        <Button
          style={{ marginTop: 8 }}
          disabled={!drawingRect}
          onClick={() =>
            drawingRect &&
            onChange({
              ...layout,
              painting_area: {
                x: Math.round(drawingRect.x * 100) / 100,
                y: Math.round(drawingRect.y * 100) / 100,
                width_mm: Math.round(drawingRect.width_mm * 100) / 100,
                height_mm: Math.round(drawingRect.height_mm * 100) / 100,
              },
            })
          }
        >
          Use drawing bounds
        </Button>
      </div>

      <div>
        <Typography.Title level={5}>Palette page</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          A4 sheet in the corner diagonally opposite the painting area, with one cross per drawing color.
        </Typography.Paragraph>
        <Space wrap>
          <Button
            type="primary"
            disabled={drawingColors.length === 0}
            onClick={() =>
              run(() => arrangeWellLayout(layout, drawingColors), (l) => `Arranged ${l.wells.length} crosses`).then(
                (l) => l && onChange(l),
              )
            }
          >
            Arrange crosses from drawing
          </Button>
          {layout.palette && <Button onClick={() => onChange({ ...layout, palette: null })}>Remove page</Button>}
        </Space>
        {drawingColors.length === 0 && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            Load an SVG first (Drawing tab).
          </Typography.Paragraph>
        )}
        {layout.palette && (
          <div style={{ marginTop: 8 }}>
            <RectInputs rect={layout.palette} onChange={(r) => onChange({ ...layout, palette: r })} />
          </div>
        )}
      </div>

      <div>
        <Flex justify="space-between" align="center">
          <Typography.Title level={5} style={{ margin: 0 }}>
            Wells ({layout.wells.length})
          </Typography.Title>
          <Button size="small" icon={<PlusOutlined />} onClick={addWell}>
            Add
          </Button>
        </Flex>
        {layout.wells.map((w) => (
          <WellRow
            key={w.id}
            well={w}
            onChange={updateWell}
            onDelete={() => onChange({ ...layout, wells: layout.wells.filter((x) => x.id !== w.id) })}
          />
        ))}
      </div>

      {warnings.map((w) => (
        <Alert key={w} type="warning" showIcon message={w} />
      ))}

      <div>
        <Typography.Title level={5}>Pencil G-code</Typography.Title>
        <Flex vertical gap={8}>
          <Checkbox
            checked={layout.draw_painting_area}
            onChange={(e) => onChange({ ...layout, draw_painting_area: e.target.checked })}
          >
            Also draw painting area and registration marks
          </Checkbox>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => run(() => downloadWellLayoutGcode(layout), (f) => `Downloaded ${f}`)}
          >
            Download pencil G-code
          </Button>
        </Flex>
      </div>
    </Flex>
  )
}
