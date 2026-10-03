import { useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'
import type { ProjectInfo } from '../api'

interface NameModalProps {
  open: boolean
  title: string
  okText: string
  initialName: string
  /** Names that are already taken. */
  taken: string[]
  hint?: string
  onClose: () => void
  onOk: (name: string) => void
}

/** Asks for a project name. Mount with a fresh `key` per opening so it starts at `initialName`. */
export function ProjectNameModal({ open, title, okText, initialName, taken, hint, onClose, onOk }: NameModalProps) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  const clash = taken.some((t) => t.toLowerCase() === trimmed.toLowerCase()) && trimmed !== initialName.trim()
  const valid = !!trimmed && !clash

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      okText={okText}
      okButtonProps={{ disabled: !valid }}
      onOk={() => valid && onOk(trimmed)}
      destroyOnHidden
    >
      {hint && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {hint}
        </Typography.Paragraph>
      )}
      <Form layout="vertical" onFinish={() => valid && onOk(trimmed)}>
        <Form.Item label="Project name" style={{ marginBottom: 8 }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunflowers" />
        </Form.Item>
      </Form>
      {clash && <Alert type="error" showIcon title={`A project named '${trimmed}' already exists`} />}
    </Modal>
  )
}

interface OpenProjectModalProps {
  open: boolean
  projects: ProjectInfo[]
  current: string | null
  onClose: () => void
  onOpen: (name: string) => void
  onDelete: (name: string) => void
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '–')

export function OpenProjectModal({ open, projects, current, onClose, onOpen, onDelete }: OpenProjectModalProps) {
  return (
    <Modal title="Open project" open={open} onCancel={onClose} footer={null} width={640} destroyOnHidden>
      <Table<ProjectInfo>
        size="small"
        rowKey="name"
        pagination={false}
        dataSource={projects}
        locale={{ emptyText: 'No projects yet' }}
        onRow={(r) => ({ onDoubleClick: () => onOpen(r.name) })}
        columns={[
          {
            title: 'Project',
            key: 'name',
            render: (_, r) => (
              <Space size={6}>
                {r.name}
                {r.name === current && <Tag color="purple">open</Tag>}
              </Space>
            ),
          },
          {
            title: 'SVG',
            key: 'svg',
            render: (_, r) => <Typography.Text type="secondary">{r.svg_filename ?? '–'}</Typography.Text>,
          },
          {
            title: 'Last saved',
            key: 'updated',
            render: (_, r) => <Typography.Text type="secondary">{when(r.updated)}</Typography.Text>,
          },
          {
            key: 'actions',
            align: 'right',
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  disabled={r.name === current}
                  onClick={() => onOpen(r.name)}
                >
                  Open
                </Button>
                <Popconfirm
                  title={`Delete project '${r.name}'?`}
                  description="Deletes its folder, including the uploaded SVG."
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDelete(r.name)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  )
}
