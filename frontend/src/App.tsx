import { useEffect, useState } from 'react'
import { Alert, Descriptions, Layout, Spin, Typography } from 'antd'
import { fetchConfig, type PlotterConfig } from './api'
import Bed from './components/Bed'

const { Header, Sider, Content } = Layout

export default function App() {
  const [config, setConfig] = useState<PlotterConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig().then(setConfig, (e: Error) => setError(e.message))
  }, [])

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          Paint Plotter
        </Typography.Title>
      </Header>
      <Layout style={{ flex: 1, minHeight: 0 }}>
        <Sider width={300} theme="light" style={{ padding: 16 }}>
          {config && (
            <Descriptions title="Plotter" column={1} size="small">
              <Descriptions.Item label="Work area">
                {config.work_area.width_mm} × {config.work_area.height_mm} mm
              </Descriptions.Item>
              <Descriptions.Item label="Z up / down">
                {config.z.up} / {config.z.down}
              </Descriptions.Item>
              <Descriptions.Item label="Travel feed">{config.feed_rates.travel_mm_min} mm/min</Descriptions.Item>
              <Descriptions.Item label="Paint feed">{config.feed_rates.paint_mm_min} mm/min</Descriptions.Item>
            </Descriptions>
          )}
        </Sider>
        <Content style={{ padding: 16, position: 'relative' }}>
          {error && <Alert type="error" showIcon message="Backend not reachable" description={error} />}
          {!config && !error && <Spin />}
          {config && (
            <div style={{ position: 'absolute', inset: 16 }}>
              <Bed widthMm={config.work_area.width_mm} heightMm={config.work_area.height_mm} />
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
