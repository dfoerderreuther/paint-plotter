import { useEffect, useMemo, useState } from 'react'
import { Alert, App as AntApp, Collapse, Descriptions, Layout, Spin, Tabs, Typography } from 'antd'
import {
  checkWellLayout,
  fetchConfig,
  uploadSvg,
  type PlotterConfig,
  type SvgDrawing,
  type WellLayout,
} from './api'
import Bed from './components/Bed'
import DrawingPanel from './components/DrawingPanel'
import DrawingView from './components/DrawingView'
import WellsPanel from './components/WellsPanel'
import WellsView from './components/WellsView'
import { DEFAULT_PLACEMENT, placedRect, type Placement } from './placement'

const { Header, Sider, Content } = Layout

const DEFAULT_LAYOUT: WellLayout = {
  name: 'default',
  painting_area: { x: 0, y: 0, width_mm: 280, height_mm: 280 },
  palette: null,
  margin_mm: 5,
  draw_painting_area: true,
  wells: [],
}

export default function App() {
  const { message } = AntApp.useApp()
  const [config, setConfig] = useState<PlotterConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [drawing, setDrawing] = useState<SvgDrawing | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const [layout, setLayout] = useState<WellLayout>(DEFAULT_LAYOUT)
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([])

  useEffect(() => {
    fetchConfig().then(setConfig, (e: Error) => setError(e.message))
  }, [])

  // Re-check the layout on the backend shortly after each edit.
  useEffect(() => {
    const t = setTimeout(() => {
      checkWellLayout(layout).then(
        (r) => setLayoutWarnings(r.warnings),
        () => setLayoutWarnings([]), // invalid while editing (e.g. empty field) - ignore
      )
    }, 250)
    return () => clearTimeout(t)
  }, [layout])

  const drawingColors = useMemo(() => [...new Set(drawing?.layers.map((l) => l.color) ?? [])], [drawing])

  const handleUpload = async (file: File) => {
    setLoading(true)
    try {
      const d = await uploadSvg(file)
      setDrawing(d)
      setFileName(file.name)
      setPlacement({ ...DEFAULT_PLACEMENT, x: layout.painting_area.x, y: layout.painting_area.y })
      setHidden(new Set())
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggleLayer = (id: string, visible: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (visible) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          Paint Plotter
        </Typography.Title>
      </Header>
      <Layout style={{ flex: 1, minHeight: 0 }}>
        <Sider width={400} theme="light" style={{ padding: '0 16px 16px', overflowY: 'auto' }}>
          {config && (
            <>
              <Tabs
                items={[
                  {
                    key: 'drawing',
                    label: 'Drawing',
                    children: (
                      <DrawingPanel
                        drawing={drawing}
                        fileName={fileName}
                        loading={loading}
                        onUpload={handleUpload}
                        placement={placement}
                        onPlacementChange={setPlacement}
                        hidden={hidden}
                        onToggleLayer={toggleLayer}
                        area={layout.painting_area}
                      />
                    ),
                  },
                  {
                    key: 'wells',
                    label: 'Wells',
                    children: (
                      <WellsPanel
                        layout={layout}
                        onChange={setLayout}
                        warnings={layoutWarnings}
                        drawingColors={drawingColors}
                        drawingRect={drawing && placedRect(drawing, placement)}
                      />
                    ),
                  },
                ]}
              />
              <Collapse
                size="small"
                style={{ marginTop: 16 }}
                items={[
                  {
                    key: 'plotter',
                    label: 'Plotter',
                    children: (
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="Work area">
                          {config.work_area.width_mm} × {config.work_area.height_mm} mm
                        </Descriptions.Item>
                        <Descriptions.Item label="Z up / down">
                          {config.z.up} / {config.z.down}
                        </Descriptions.Item>
                        <Descriptions.Item label="Travel feed">
                          {config.feed_rates.travel_mm_min} mm/min
                        </Descriptions.Item>
                        <Descriptions.Item label="Paint feed">
                          {config.feed_rates.paint_mm_min} mm/min
                        </Descriptions.Item>
                        <Descriptions.Item label="Park">
                          X{config.park.x_mm} Y{config.park.y_mm}
                        </Descriptions.Item>
                      </Descriptions>
                    ),
                  },
                ]}
              />
            </>
          )}
        </Sider>
        <Content style={{ padding: 16, position: 'relative' }}>
          {error && <Alert type="error" showIcon message="Backend not reachable" description={error} />}
          {!config && !error && <Spin />}
          {config && (
            <div style={{ position: 'absolute', inset: 16 }}>
              <Bed widthMm={config.work_area.width_mm} heightMm={config.work_area.height_mm}>
                <WellsView layout={layout} />
                {drawing && <DrawingView drawing={drawing} placement={placement} hidden={hidden} />}
              </Bed>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
