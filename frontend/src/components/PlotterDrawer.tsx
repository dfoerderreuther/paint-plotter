import { Descriptions, Drawer, Typography } from 'antd'
import type { PlotterConfig } from '../api'

export default function PlotterDrawer({ open, onClose, config }: { open: boolean; onClose: () => void; config: PlotterConfig }) {
  return (
    <Drawer title="Plotter settings" open={open} onClose={onClose} size={380}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Work area">
          {config.work_area.width_mm} × {config.work_area.height_mm} mm
        </Descriptions.Item>
        <Descriptions.Item label="Origin">bottom left</Descriptions.Item>
        <Descriptions.Item label="Z up / down">
          {config.z.up} / {config.z.down}
        </Descriptions.Item>
        <Descriptions.Item label="Travel feed">{config.feed_rates.travel_mm_min} mm/min</Descriptions.Item>
        <Descriptions.Item label="Paint feed">{config.feed_rates.paint_mm_min} mm/min</Descriptions.Item>
        <Descriptions.Item label="Park position">
          X {config.park.x_mm} · Y {config.park.y_mm}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Edit <Typography.Text code>config/plotter.json</Typography.Text> and reload the page to change these.
      </Typography.Paragraph>
    </Drawer>
  )
}
