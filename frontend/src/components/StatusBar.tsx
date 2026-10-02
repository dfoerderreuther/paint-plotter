import { Badge, Divider, Flex, Tooltip, Typography } from 'antd'

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

const SAVE_BADGE: Record<SaveState, { status: 'success' | 'processing' | 'default' | 'error'; text: string }> = {
  saved: { status: 'success', text: 'Saved' },
  pending: { status: 'default', text: 'Unsaved changes' },
  saving: { status: 'processing', text: 'Saving…' },
  error: { status: 'error', text: 'Save failed' },
}

interface StatusBarProps {
  projectName: string | null
  saveState: SaveState
  saveError: string | null
  fileName: string | null
  scale: number | null
  layoutName: string
  layoutDirty: boolean
  warningCount: number
  /** [assigned, total] drawing colors, or null without a drawing. */
  colorsAssigned: [number, number] | null
  workArea: string
}

export default function StatusBar(p: StatusBarProps) {
  const text = { type: 'secondary' as const, style: { fontSize: 12 } }
  const save = SAVE_BADGE[p.saveState]
  return (
    <Flex align="center" style={{ height: 28, padding: '0 16px', borderTop: '1px solid #0000000f', background: '#fff' }}>
      <Typography.Text {...text}>Project: {p.projectName ?? '…'}</Typography.Text>
      <Tooltip title={p.saveError}>
        <Badge style={{ marginLeft: 8 }} status={save.status} text={<Typography.Text {...text}>{save.text}</Typography.Text>} />
      </Tooltip>
      <Divider orientation="vertical" />
      <Typography.Text {...text}>{p.fileName ? `${p.fileName} · scale ${p.scale}` : 'No drawing'}</Typography.Text>
      <Divider orientation="vertical" />
      <Typography.Text {...text}>
        Layout: {p.layoutName}
        {p.layoutDirty && ' (unsaved)'}
      </Typography.Text>
      <Divider orientation="vertical" />
      {p.colorsAssigned && (
        <>
          <Badge
            status={p.colorsAssigned[0] === p.colorsAssigned[1] ? 'success' : 'warning'}
            text={
              <Typography.Text {...text}>
                {p.colorsAssigned[0]}/{p.colorsAssigned[1]} colors assigned
              </Typography.Text>
            }
          />
          <Divider orientation="vertical" />
        </>
      )}
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
