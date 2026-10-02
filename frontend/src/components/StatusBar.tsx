import { Badge, Divider, Flex, Typography } from 'antd'

interface StatusBarProps {
  fileName: string | null
  scale: number | null
  layoutName: string
  layoutDirty: boolean
  warningCount: number
  workArea: string
}

export default function StatusBar(p: StatusBarProps) {
  const text = { type: 'secondary' as const, style: { fontSize: 12 } }
  return (
    <Flex align="center" style={{ height: 28, padding: '0 16px', borderTop: '1px solid #0000000f', background: '#fff' }}>
      <Typography.Text {...text}>{p.fileName ? `${p.fileName} · scale ${p.scale}` : 'No drawing'}</Typography.Text>
      <Divider orientation="vertical" />
      <Typography.Text {...text}>
        Layout: {p.layoutName}
        {p.layoutDirty && ' (unsaved)'}
      </Typography.Text>
      <Divider orientation="vertical" />
      {p.warningCount > 0 ? (
        <Badge status="warning" text={<Typography.Text {...text}>{p.warningCount} layout warnings</Typography.Text>} />
      ) : (
        <Badge status="success" text={<Typography.Text {...text}>Layout OK</Typography.Text>} />
      )}
      <Typography.Text {...text} style={{ ...text.style, marginLeft: 'auto' }}>
        Work area {p.workArea}
      </Typography.Text>
    </Flex>
  )
}
