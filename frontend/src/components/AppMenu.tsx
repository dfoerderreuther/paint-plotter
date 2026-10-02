import { Button, Dropdown, Flex, type MenuProps } from 'antd'
import {
  DownOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons'

export type MenuAction =
  | 'load-svg'
  | 'layout-new'
  | 'layout-open'
  | 'layout-save'
  | 'layout-save-as'
  | 'export-pencil'
  | 'plotter-settings'

type Items = NonNullable<MenuProps['items']>

const MENUS: { label: string; items: Items }[] = [
  {
    label: 'File',
    items: [
      { key: 'load-svg', label: 'Load SVG…', icon: <FileImageOutlined /> },
      { type: 'divider' },
      {
        type: 'group',
        label: 'Well layout',
        children: [
          { key: 'layout-new', label: 'New', icon: <FileAddOutlined /> },
          { key: 'layout-open', label: 'Open…', icon: <FolderOpenOutlined /> },
          { key: 'layout-save', label: 'Save', icon: <SaveOutlined /> },
          { key: 'layout-save-as', label: 'Save as…' },
        ],
      },
    ],
  },
  {
    label: 'Export',
    items: [{ key: 'export-pencil', label: 'Pencil G-code (palette crosses)', icon: <DownloadOutlined /> }],
  },
  {
    label: 'View',
    items: [{ key: 'plotter-settings', label: 'Plotter settings', icon: <SettingOutlined /> }],
  },
]

/** Desktop-style menu bar: one click-to-open dropdown per menu. */
export default function AppMenu({ onAction }: { onAction: (a: MenuAction) => void }) {
  return (
    <Flex gap={4} style={{ flex: 1 }}>
      {MENUS.map((m) => (
        <Dropdown
          key={m.label}
          trigger={['click']}
          menu={{ items: m.items, onClick: ({ key }) => onAction(key as MenuAction) }}
        >
          <Button type="text" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {m.label} <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      ))}
    </Flex>
  )
}
