import type { ReactNode } from 'react'
import { Col, Form, InputNumber, Row, Switch, type InputNumberProps } from 'antd'

/**
 * Shared building blocks for the side panel forms: a labelled field with a (?) tooltip,
 * a full-width number input, and a row of up to two fields side by side.
 */

interface FieldProps {
  label: ReactNode
  tooltip: ReactNode
  children: ReactNode
}

export function Field({ label, tooltip, children }: FieldProps) {
  return (
    <Form.Item label={label} tooltip={tooltip} style={{ marginBottom: 10 }}>
      {children}
    </Form.Item>
  )
}

/** Two (or one) fields side by side; each child takes an equal share of the row. */
export function FieldRow({ children }: { children: ReactNode[] | ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean)
  return (
    <Row gutter={8}>
      {items.map((child, i) => (
        <Col key={i} span={items.length === 1 ? 24 : 12}>
          {child}
        </Col>
      ))}
    </Row>
  )
}

export function Num(props: InputNumberProps<number>) {
  return <InputNumber<number> {...props} style={{ width: '100%', ...props.style }} />
}

/** A switch as a labelled field (so it lines up with the inputs next to it). */
export function SwitchField({
  label,
  tooltip,
  checked,
  onChange,
}: {
  label: ReactNode
  tooltip: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field label={label} tooltip={tooltip}>
      <Switch checked={checked} onChange={onChange} checkedChildren="On" unCheckedChildren="Off" />
    </Field>
  )
}
