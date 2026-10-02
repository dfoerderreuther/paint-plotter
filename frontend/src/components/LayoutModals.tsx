import { useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Table } from 'antd'
import { DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'

interface OpenLayoutModalProps {
  open: boolean
  saved: string[]
  onClose: () => void
  onOpen: (name: string) => void
  onDelete: (name: string) => void
}

export function OpenLayoutModal({ open, saved, onClose, onOpen, onDelete }: OpenLayoutModalProps) {
  return (
    <Modal title="Open well layout" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <Table
        size="small"
        rowKey="name"
        pagination={false}
        dataSource={saved.map((name) => ({ name }))}
        locale={{ emptyText: 'No saved layouts yet' }}
        onRow={(r) => ({ onDoubleClick: () => onOpen(r.name) })}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          {
            key: 'actions',
            align: 'right',
            render: (_, r) => (
              <Space>
                <Button size="small" type="primary" icon={<FolderOpenOutlined />} onClick={() => onOpen(r.name)}>
                  Open
                </Button>
                <Popconfirm title={`Delete '${r.name}'?`} okButtonProps={{ danger: true }} onConfirm={() => onDelete(r.name)}>
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

interface SaveLayoutModalProps {
  open: boolean
  initialName: string
  saved: string[]
  onClose: () => void
  onSave: (name: string) => void
}

/** Mount with a fresh `key` per opening so the name starts at `initialName`. */
export function SaveLayoutModal({ open, initialName, saved, onClose, onSave }: SaveLayoutModalProps) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()

  return (
    <Modal
      title="Save well layout as"
      open={open}
      onCancel={onClose}
      okText="Save"
      okButtonProps={{ disabled: !trimmed }}
      onOk={() => onSave(trimmed)}
      destroyOnHidden
    >
      <Form layout="vertical" onFinish={() => trimmed && onSave(trimmed)}>
        <Form.Item label="Name" style={{ marginBottom: 8 }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Form.Item>
      </Form>
      {saved.includes(trimmed) && <Alert type="warning" showIcon title={`'${trimmed}' exists and will be replaced`} />}
    </Modal>
  )
}
