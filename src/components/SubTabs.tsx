import { useState, useRef, useCallback, type ComponentType } from 'react'
import { Tabs, message } from 'antd'

interface ChildProps {
  onStatusChange: (s: string) => void
  isActive?: boolean
}

interface SubTabsProps {
  Component: ComponentType<ChildProps>
  onStatusChange: (s: string) => void
  name: string
}

interface SubTab {
  key: string
  label: string
}

const MAX_TABS = 10

export default function SubTabs({ Component, onStatusChange, name }: SubTabsProps) {
  const counterRef = useRef(0)
  const [tabs, setTabs] = useState<SubTab[]>([{ key: '0', label: name }])
  const [activeKey, setActiveKey] = useState('0')

  const handleEdit = useCallback(
    (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
      if (action === 'add') {
        if (tabs.length >= MAX_TABS) {
          message.warning(`最多打开 ${MAX_TABS} 个页签`)
          return
        }
        counterRef.current++
        const newKey = String(counterRef.current)
        const newTabs = [...tabs, { key: newKey, label: `${name} ${counterRef.current}` }]
        setTabs(newTabs)
        setActiveKey(newKey)
      } else {
        const key = targetKey as string
        const idx = tabs.findIndex((t) => t.key === key)
        if (idx < 0 || tabs.length <= 1) return
        let newTabs = tabs.filter((t) => t.key !== key)
        if (newTabs.length === 1) {
          counterRef.current = 0
          newTabs = [{ ...newTabs[0], label: name }]
        }
        if (activeKey === key) {
          const nextIdx = idx >= newTabs.length ? newTabs.length - 1 : idx
          setActiveKey(newTabs[nextIdx].key)
        }
        setTabs(newTabs)
      }
    },
    [tabs, activeKey, name],
  )

  const items = tabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    closable: tabs.length > 1,
    children: <Component onStatusChange={onStatusChange} isActive={tab.key === activeKey} />,
  }))

  return (
    <Tabs
      type="editable-card"
      size="small"
      activeKey={activeKey}
      onChange={setActiveKey}
      onEdit={handleEdit}
      items={items}
      destroyInactiveTabPane={false}
      className="sub-tabs"
    />
  )
}
