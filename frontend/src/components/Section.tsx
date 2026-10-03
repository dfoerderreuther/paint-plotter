import { useState, type ReactNode } from 'react'
import { Collapse } from 'antd'

const KEY = 'paint-plotter.collapsed-sections'

// Which sections are collapsed is remembered per browser (convenience only).
function collapsedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function remember(id: string, open: boolean) {
  try {
    const s = collapsedSet()
    if (open) s.delete(id)
    else s.add(id)
    localStorage.setItem(KEY, JSON.stringify([...s]))
  } catch {
    // storage unavailable
  }
}

interface SectionProps {
  /** Stable id, used to remember the collapsed state. */
  id: string
  title: ReactNode
  /** Header controls on the right (clicks on them don't collapse the section). */
  extra?: ReactNode
  /** No padding around the content (e.g. for tables). */
  flush?: boolean
  children: ReactNode
}

/** A collapsible box for the side panels. */
export default function Section({ id, title, extra, flush, children }: SectionProps) {
  const [open, setOpen] = useState(() => !collapsedSet().has(id))
  return (
    <Collapse
      size="small"
      activeKey={open ? [id] : []}
      onChange={(keys) => {
        const o = (Array.isArray(keys) ? keys : [keys]).includes(id)
        setOpen(o)
        remember(id, o)
      }}
      styles={{ header: { fontWeight: 600 }, body: flush ? { padding: 0 } : undefined }}
      items={[
        {
          key: id,
          label: title,
          extra: extra && (
            <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
              {extra}
            </span>
          ),
          children,
        },
      ]}
    />
  )
}
