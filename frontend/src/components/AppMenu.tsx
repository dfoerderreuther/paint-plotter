import { Button, Dropdown, Flex, type MenuProps } from 'antd'
import {
  DownOutlined,
  EditOutlined,
  FolderAddOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons'

export type MenuAction =
  | 'project-new'
  | 'project-open'
  | 'project-rename'
  | 'load-svg'
  | 'layout-new'
  | 'layout-open'
  | 'layout-save'
  | 'layout-save-as'
  | 'export-pencil'
  | 'export-zip'
  | 'plotter-settings'

type Items = NonNullable<MenuProps['items']>

const MENUS: { label: string; items: Items }[] = [
  {
    label: 'File',
    items: [
      {
        type: 'group',
        label: 'Project',
        children: [
          { key: 'project-new', label: 'New project…', icon: <FolderAddOutlined /> },
          { key: 'project-open', label: 'Open project…', icon: <FolderOpenOutlined /> },
          { key: 'project-rename', label: 'Rename project…', icon: <EditOutlined /> },
        ],
      },
      { type: 'divider' },
      { key: 'load-svg', label: 'Load SVG into project…', icon: <FileImageOutlined /> },
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
    items: [
      { key: 'export-zip', label: 'All painting files (.zip)', icon: <FileZipOutlined /> },
      { type: 'divider' },
      { key: 'export-pencil', label: 'Pencil G-code (palette crosses)', icon: <DownloadOutlined /> },
    ],
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
