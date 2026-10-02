import { Alert, Card, Flex, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColorMatch, PaintLayer, Well } from '../api'
import { AUTO, SKIP, matchQuality, type ColorChoices } from '../colorMap'
import { Swatch } from './DrawingPanel'

interface ColorsPanelProps {
  colors: string[]
  layers: PaintLayer[]
  wells: Well[]
  matches: ColorMatch[]
  choices: ColorChoices
  onChoicesChange: (c: ColorChoices) => void
  /** Resolved well per color (null = not painted). */
  resolved: Record<string, string | null>
  previewPaint: boolean
  onPreviewPaintChange: (v: boolean) => void
}

interface Row {
  color: string
  layers: PaintLayer[]
}

export default function ColorsPanel(p: ColorsPanelProps) {
  const wellById = new Map(p.wells.map((w) => [w.id, w]))
  const matchByColor = new Map(p.matches.map((m) => [m.color, m]))
  const rows: Row[] = p.colors.map((color) => ({ color, layers: p.layers.filter((l) => l.color === color) }))
  const assigned = p.colors.filter((c) => p.resolved[c]).length

  if (p.colors.length === 0) {
    return <Alert type="info" showIcon title="Load an SVG first (File → Load SVG…)" />
  }

  const setChoice = (color: string, value: string) => {
    const next = { ...p.choices }
    if (value === AUTO) delete next[color]
    else next[color] = value === SKIP ? null : value
    p.onChoicesChange(next)
  }

  return (
    <Flex vertical gap={12}>
      {p.wells.length === 0 && (
        <Alert type="warning" showIcon title="No wells yet" description="Create them in the Wells tab (Arrange crosses)." />
      )}

      <Card size="small">
        <Flex justify="space-between" align="center">
          <Typography.Text>
            {assigned} of {p.colors.length} colors assigned
          </Typography.Text>
          <Space size={6}>
            <Typography.Text type="secondary">Preview in paint colors</Typography.Text>
            <Switch size="small" checked={p.previewPaint} onChange={p.onPreviewPaintChange} />
          </Space>
        </Flex>
      </Card>

      <Card size="small" title="Drawing color → well" styles={{ body: { padding: 0 } }}>
        <Table<Row>
          size="small"
          rowKey="color"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: 'Color',
              key: 'color',
              render: (_, r) => (
                <Flex vertical gap={2}>
                  <Space size={6}>
                    <Swatch color={r.color} />
                    <Typography.Text code style={{ fontSize: 12 }}>
                      {r.color}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {r.layers.map((l) => (l.kind === 'fill' ? 'fill' : 'line')).join(' + ')}
                  </Typography.Text>
                </Flex>
              ),
            },
            {
              title: 'Well',
              key: 'well',
              render: (_, r) => {
                const match = matchByColor.get(r.color)
                const choice = p.choices[r.color]
                const value =
                  choice === null ? SKIP : choice !== undefined && wellById.has(choice) ? choice : AUTO
                const best = match?.best_well_id ? wellById.get(match.best_well_id) : undefined
                const sorted = [...p.wells].sort(
                  (a, b) => (match?.distances[a.id] ?? 0) - (match?.distances[b.id] ?? 0),
                )
                return (
                  <Select
                    size="small"
                    style={{ width: '100%', minWidth: 150 }}
                    value={value}
                    onChange={(v: string) => setChoice(r.color, v)}
                    options={[
                      { value: AUTO, label: best ? `Auto (${best.name})` : 'Auto' },
                      ...sorted.map((w) => ({
                        value: w.id,
                        label: (
                          <Space size={6}>
                            <Swatch color={w.color} />
                            {w.name}
                            {match && (
                              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                ΔE {match.distances[w.id]}
                              </Typography.Text>
                            )}
                          </Space>
                        ),
                      })),
                      { value: SKIP, label: "Don't paint" },
                    ]}
                  />
                )
              },
            },
            {
              title: 'Match',
              key: 'match',
              align: 'right',
              render: (_, r) => {
                const wellId = p.resolved[r.color]
                const d = wellId ? matchByColor.get(r.color)?.distances[wellId] : undefined
                if (!wellId) return <Tag>skip</Tag>
                if (d === undefined) return null
                const q = matchQuality(d)
                return (
                  <Tooltip title={`ΔE ${d} (color difference; < 2.3 is barely visible)`}>
                    <Tag color={q.color}>{q.label}</Tag>
                  </Tooltip>
                )
              },
            },
          ]}
        />
      </Card>
    </Flex>
  )
}
