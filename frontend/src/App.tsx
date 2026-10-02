import { useEffect, useState } from 'react'
import { Alert, App as AntApp, Collapse, Descriptions, Flex, Layout, Spin, Typography } from 'antd'
import { fetchConfig, uploadSvg, type PlotterConfig, type SvgDrawing } from './api'
import Bed from './components/Bed'
import DrawingPanel from './components/DrawingPanel'
import DrawingView from './components/DrawingView'
import { DEFAULT_PLACEMENT, type Placement } from './placement'

const { Header, Sider, Content } = Layout

export default function App() {
  const { message } = AntApp.useApp()
  const [config, setConfig] = useState<PlotterConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [drawing, setDrawing] = useState<SvgDrawing | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchConfig().then(setConfig, (e: Error) => setError(e.message))
  }, [])

  const handleUpload = async (file: File) => {
    setLoading(true)
    try {
      const d = await uploadSvg(file)
      setDrawing(d)
      setFileName(file.name)
      setPlacement(DEFAULT_PLACEMENT)
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
        <Sider width={380} theme="light" style={{ padding: 16, overflowY: 'auto' }}>
          {config && (
            <Flex vertical gap={16}>
              <DrawingPanel
                drawing={drawing}
                fileName={fileName}
                loading={loading}
                onUpload={handleUpload}
                placement={placement}
                onPlacementChange={setPlacement}
                hidden={hidden}
                onToggleLayer={toggleLayer}
                bedWidth={config.work_area.width_mm}
                bedHeight={config.work_area.height_mm}
              />
              <Collapse
                size="small"
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
                      </Descriptions>
                    ),
                  },
                ]}
              />
            </Flex>
          )}
        </Sider>
        <Content style={{ padding: 16, position: 'relative' }}>
          {error && <Alert type="error" showIcon message="Backend not reachable" description={error} />}
          {!config && !error && <Spin />}
          {config && (
            <div style={{ position: 'absolute', inset: 16 }}>
              <Bed widthMm={config.work_area.width_mm} heightMm={config.work_area.height_mm}>
                {drawing && <DrawingView drawing={drawing} placement={placement} hidden={hidden} />}
              </Bed>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
