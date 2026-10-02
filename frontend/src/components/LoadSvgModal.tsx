import { useState } from 'react'
import { Modal, Typography, Upload } from 'antd'
import { InboxOutlined } from '@ant-design/icons'

interface LoadSvgModalProps {
  open: boolean
  onClose: () => void
  /** Resolves when the file was read; the modal then closes. */
  onLoad: (file: File) => Promise<boolean>
}

export default function LoadSvgModal({ open, onClose, onLoad }: LoadSvgModalProps) {
  const [loading, setLoading] = useState(false)

  return (
    <Modal title="Load SVG" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <Upload.Dragger
        accept=".svg,image/svg+xml"
        showUploadList={false}
        disabled={loading}
        beforeUpload={(file) => {
          setLoading(true)
          onLoad(file)
            .then((ok) => ok && onClose())
            .finally(() => setLoading(false))
          return false
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{loading ? 'Reading SVG…' : 'Click or drop an SVG file here'}</p>
        <p className="ant-upload-hint">Colors become fill and line layers. Size is taken from the SVG (mm).</p>
      </Upload.Dragger>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        Gradients and <Typography.Text code>currentColor</Typography.Text> are not supported and are skipped with a
        warning.
      </Typography.Paragraph>
    </Modal>
  )
}
