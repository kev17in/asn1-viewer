import { useState, useEffect, useCallback, useMemo } from 'react'
import { Input, Button, Checkbox, Empty, Tooltip, message, Modal, Segmented, DatePicker, Tag, Select, Space } from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ClearOutlined,
  ClockCircleOutlined, CheckOutlined, CloseOutlined,
  BellOutlined, BellFilled, FlagOutlined,
  CalendarOutlined, FileTextOutlined, SortAscendingOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

interface TodoItem {
  id: string
  text: string
  note?: string
  done: boolean
  createdAt: number
  priority?: 'high' | 'medium' | 'low'
  dueDate?: number
  reminderTime?: number
  reminded?: boolean
}

interface Props {
  onStatusChange: (s: string) => void
}

type Filter = 'all' | 'active' | 'done'
type SortMode = 'time' | 'priority' | 'dueDate'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

const PRIORITY_CONFIG = {
  high: { color: '#ff4d4f', label: '高', tag: 'red', order: 0 },
  medium: { color: '#faad14', label: '中', tag: 'orange', order: 1 },
  low: { color: '#52c41a', label: '低', tag: 'green', order: 2 },
} as const

function dueDateStatus(dueDate: number): { text: string; color: string } {
  const now = Date.now()
  const diff = dueDate - now
  const days = Math.ceil(diff / 86400_000)
  if (days < 0) return { text: `已过期 ${Math.abs(days)} 天`, color: '#ff4d4f' }
  if (days === 0) return { text: '今天到期', color: '#faad14' }
  if (days === 1) return { text: '明天到期', color: '#faad14' }
  return { text: `${days} 天后到期`, color: '#999' }
}

function priorityOrder(p?: 'high' | 'medium' | 'low'): number {
  if (!p) return 3
  return PRIORITY_CONFIG[p].order
}

export default function TodoTab({ onStatusChange }: Props) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('time')
  const [priorityFilter, setPriorityFilter] = useState<'high' | 'medium' | 'low' | undefined>(undefined)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')

  const [settingReminderId, setSettingReminderId] = useState<string | null>(null)
  const [reminderValue, setReminderValue] = useState<dayjs.Dayjs | null>(null)
  const [settingDueDateId, setSettingDueDateId] = useState<string | null>(null)
  const [dueDateValue, setDueDateValue] = useState<dayjs.Dayjs | null>(null)

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const [inputNote, setInputNote] = useState('')
  const [inputPriority, setInputPriority] = useState<'high' | 'medium' | 'low' | undefined>(undefined)
  const [inputDueDate, setInputDueDate] = useState<dayjs.Dayjs | null>(null)
  const [inputReminder, setInputReminder] = useState<dayjs.Dayjs | null>(null)

  useEffect(() => {
    window.electronAPI?.getTodos().then((data) => {
      if (Array.isArray(data)) setTodos(data)
    })
    const cleanupReminder = window.electronAPI?.onTodoReminder((todoId) => {
      message.info({ content: '待办提醒触发', key: `reminder-${todoId}` })
    })
    const cleanupUpdated = window.electronAPI?.onTodosUpdated((updated) => {
      if (Array.isArray(updated)) setTodos(updated as TodoItem[])
    })
    return () => { cleanupReminder?.(); cleanupUpdated?.() }
  }, [])

  const saveTodos = useCallback((updated: TodoItem[]) => {
    setTodos(updated)
    window.electronAPI?.saveTodos(updated)
  }, [])

  const resetAddForm = () => {
    setInputText('')
    setInputNote('')
    setInputPriority(undefined)
    setInputDueDate(null)
    setInputReminder(null)
  }

  const handleAdd = useCallback(() => {
    const text = inputText.trim()
    if (!text) { message.warning('请输入待办内容'); return }
    const item: TodoItem = {
      id: generateId(),
      text,
      note: inputNote.trim() || undefined,
      done: false,
      createdAt: Date.now(),
      priority: inputPriority,
      dueDate: inputDueDate?.endOf('day').valueOf(),
      reminderTime: inputReminder?.valueOf(),
    }
    const updated = [item, ...todos]
    saveTodos(updated)
    resetAddForm()
    setAddModalOpen(false)
    onStatusChange(`已添加: ${text}`)
  }, [inputText, inputNote, inputPriority, inputDueDate, inputReminder, todos, saveTodos, onStatusChange])

  const handleToggle = useCallback((id: string) => {
    const updated = todos.map((t) => t.id === id ? { ...t, done: !t.done } : t)
    saveTodos(updated)
  }, [todos, saveTodos])

  const handleDelete = useCallback((id: string) => {
    const updated = todos.filter((t) => t.id !== id)
    saveTodos(updated)
    onStatusChange('已删除')
  }, [todos, saveTodos, onStatusChange])

  const handleStartEdit = useCallback((item: TodoItem) => {
    setEditingId(item.id)
    setEditText(item.text)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return
    const text = editText.trim()
    if (!text) { message.warning('内容不能为空'); return }
    const updated = todos.map((t) => t.id === editingId ? { ...t, text } : t)
    saveTodos(updated)
    setEditingId(null)
    setEditText('')
    onStatusChange('已更新')
  }, [editingId, editText, todos, saveTodos, onStatusChange])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditText('')
  }, [])

  const handleStartEditNote = useCallback((item: TodoItem) => {
    setEditingNoteId(item.id)
    setEditNoteText(item.note || '')
  }, [])

  const handleSaveNote = useCallback(() => {
    if (!editingNoteId) return
    const updated = todos.map((t) =>
      t.id === editingNoteId ? { ...t, note: editNoteText.trim() || undefined } : t,
    )
    saveTodos(updated)
    setEditingNoteId(null)
    setEditNoteText('')
    onStatusChange('备注已更新')
  }, [editingNoteId, editNoteText, todos, saveTodos, onStatusChange])

  const handleCancelEditNote = useCallback(() => {
    setEditingNoteId(null)
    setEditNoteText('')
  }, [])

  const handleSetReminder = useCallback((id: string) => {
    const todo = todos.find((t) => t.id === id)
    setSettingReminderId(id)
    setReminderValue(todo?.reminderTime ? dayjs(todo.reminderTime) : null)
  }, [todos])

  const handleSaveReminder = useCallback(() => {
    if (!settingReminderId) return
    const updated = todos.map((t) =>
      t.id === settingReminderId
        ? { ...t, reminderTime: reminderValue?.valueOf(), reminded: false }
        : t,
    )
    saveTodos(updated)
    setSettingReminderId(null)
    setReminderValue(null)
    onStatusChange(reminderValue ? '已设置提醒' : '已取消提醒')
  }, [settingReminderId, reminderValue, todos, saveTodos, onStatusChange])

  const handleSetDueDate = useCallback((id: string) => {
    const todo = todos.find((t) => t.id === id)
    setSettingDueDateId(id)
    setDueDateValue(todo?.dueDate ? dayjs(todo.dueDate) : null)
  }, [todos])

  const handleSaveDueDate = useCallback(() => {
    if (!settingDueDateId) return
    const updated = todos.map((t) =>
      t.id === settingDueDateId
        ? { ...t, dueDate: dueDateValue?.endOf('day').valueOf() }
        : t,
    )
    saveTodos(updated)
    setSettingDueDateId(null)
    setDueDateValue(null)
    onStatusChange(dueDateValue ? '已设置截止日期' : '已取消截止日期')
  }, [settingDueDateId, dueDateValue, todos, saveTodos, onStatusChange])

  const handleChangePriority = useCallback((id: string, priority: 'high' | 'medium' | 'low' | undefined) => {
    const updated = todos.map((t) => t.id === id ? { ...t, priority } : t)
    saveTodos(updated)
  }, [todos, saveTodos])

  const handleClearDone = useCallback(() => {
    const doneCount = todos.filter((t) => t.done).length
    if (doneCount === 0) return
    Modal.confirm({
      title: '清除已完成',
      content: `确定要清除 ${doneCount} 条已完成的待办吗？`,
      okText: '清除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        const updated = todos.filter((t) => !t.done)
        saveTodos(updated)
        onStatusChange(`已清除 ${doneCount} 条已完成待办`)
      },
    })
  }, [todos, saveTodos, onStatusChange])

  const filtered = useMemo(() => {
    let items = todos
    if (filter === 'active') items = items.filter((t) => !t.done)
    else if (filter === 'done') items = items.filter((t) => t.done)
    if (priorityFilter) items = items.filter((t) => t.priority === priorityFilter)

    if (sortMode === 'priority') {
      items = [...items].sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    } else if (sortMode === 'dueDate') {
      items = [...items].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate - b.dueDate
      })
    }
    return items
  }, [todos, filter, priorityFilter, sortMode])

  const activeCount = useMemo(() => todos.filter((t) => !t.done).length, [todos])
  const doneCount = useMemo(() => todos.filter((t) => t.done).length, [todos])

  return (
    <div className="todo-page">
      {/* Filter & stats */}
      <div className="todo-toolbar">
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { label: `全部 ${todos.length}`, value: 'all' },
            { label: `待办 ${activeCount}`, value: 'active' },
            { label: `已完成 ${doneCount}`, value: 'done' },
          ]}
        />
        <Select
          size="small"
          placeholder="优先级筛选"
          value={priorityFilter}
          onChange={(v) => setPriorityFilter(v)}
          allowClear
          style={{ width: 110 }}
          options={[
            { label: '高优先级', value: 'high' },
            { label: '中优先级', value: 'medium' },
            { label: '低优先级', value: 'low' },
          ]}
        />
        <Select
          size="small"
          value={sortMode}
          onChange={(v) => setSortMode(v)}
          style={{ width: 110 }}
          suffixIcon={<SortAscendingOutlined />}
          options={[
            { label: '按时间', value: 'time' },
            { label: '按优先级', value: 'priority' },
            { label: '按截止日', value: 'dueDate' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <div className="todo-toolbar-right">
          <span className="todo-count">{activeCount} 项待完成</span>
          <Tooltip title="清除已完成">
            <Button size="small" danger icon={<ClearOutlined />} onClick={handleClearDone} disabled={doneCount === 0} />
          </Tooltip>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            新增
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="todo-list">
        {filtered.length === 0 ? (
          <div className="todo-empty">
            <Empty
              description={
                filter === 'all' ? '暂无待办，添加一条吧' :
                filter === 'active' ? '所有任务已完成' : '暂无已完成的任务'
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : (
          filtered.map((item) => {
            const due = item.dueDate ? dueDateStatus(item.dueDate) : null
            return (
              <div key={item.id} className={`todo-item ${item.done ? 'todo-item-done' : ''}${item.priority ? ` todo-item-priority-${item.priority}` : ''}`}>
                <Checkbox
                  checked={item.done}
                  onChange={() => handleToggle(item.id)}
                  style={{ marginTop: 2 }}
                />
                <div className="todo-item-body">
                  {editingId === item.id ? (
                    <Input.TextArea
                      className="todo-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSaveEdit() } }}
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      autoFocus
                    />
                  ) : (
                    <div className="todo-item-text">{item.text}</div>
                  )}
                  {/* Note display / edit */}
                  {editingNoteId === item.id ? (
                    <div className="todo-note-edit">
                      <Input.TextArea
                        value={editNoteText}
                        onChange={(e) => setEditNoteText(e.target.value)}
                        placeholder="输入备注..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveNote() }
                          if (e.key === 'Escape') handleCancelEditNote()
                        }}
                        style={{ fontSize: 12 }}
                      />
                      <Space size={4} style={{ marginTop: 4 }}>
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveNote}>保存</Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEditNote}>取消</Button>
                      </Space>
                    </div>
                  ) : item.note ? (
                    <div
                      className="todo-item-note"
                      onClick={() => handleStartEditNote(item)}
                      title="点击编辑备注"
                    >
                      <FileTextOutlined style={{ fontSize: 10, marginRight: 4 }} />
                      {item.note}
                    </div>
                  ) : null}
                  <div className="todo-item-meta-row">
                    <span className="todo-item-time">
                      <ClockCircleOutlined style={{ fontSize: 10 }} />
                      {relativeTime(item.createdAt)}
                    </span>
                    {item.priority && (
                      <Tag
                        color={PRIORITY_CONFIG[item.priority].tag}
                        style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
                      >
                        <FlagOutlined style={{ marginRight: 2 }} />
                        {PRIORITY_CONFIG[item.priority].label}
                      </Tag>
                    )}
                    {due && !item.done && (
                      <span style={{ fontSize: 11, color: due.color }}>
                        <CalendarOutlined style={{ marginRight: 2 }} />
                        {due.text}
                      </span>
                    )}
                    {item.reminderTime && !item.done && (
                      <span style={{ fontSize: 11, color: item.reminded ? '#999' : '#1890ff' }}>
                        <BellFilled style={{ marginRight: 2 }} />
                        {dayjs(item.reminderTime).format('MM-DD HH:mm')}
                        {item.reminded && ' (已提醒)'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="todo-item-actions">
                  {editingId === item.id ? (
                    <>
                      <Tooltip title="保存">
                        <Button type="text" size="small" icon={<CheckOutlined />} onClick={handleSaveEdit} style={{ color: '#52c41a' }} />
                      </Tooltip>
                      <Tooltip title="取消">
                        <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleCancelEdit} />
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <Select
                        size="small"
                        placeholder={<FlagOutlined />}
                        value={item.priority}
                        onChange={(v) => handleChangePriority(item.id, v)}
                        allowClear
                        style={{ width: 60 }}
                        variant="borderless"
                        popupMatchSelectWidth={false}
                        options={[
                          { label: '高', value: 'high' },
                          { label: '中', value: 'medium' },
                          { label: '低', value: 'low' },
                        ]}
                      />
                      <Tooltip title="截止日期">
                        <Button
                          type="text"
                          size="small"
                          icon={<CalendarOutlined style={item.dueDate ? { color: '#1890ff' } : undefined} />}
                          onClick={() => handleSetDueDate(item.id)}
                        />
                      </Tooltip>
                      <Tooltip title="设置提醒">
                        <Button
                          type="text"
                          size="small"
                          icon={item.reminderTime
                            ? <BellFilled style={{ color: item.reminded ? '#999' : '#1890ff' }} />
                            : <BellOutlined />}
                          onClick={() => handleSetReminder(item.id)}
                        />
                      </Tooltip>
                      <Tooltip title={item.note ? '编辑备注' : '添加备注'}>
                        <Button
                          type="text"
                          size="small"
                          icon={<FileTextOutlined style={item.note ? { color: '#1890ff' } : undefined} />}
                          onClick={() => handleStartEditNote(item)}
                        />
                      </Tooltip>
                      <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleStartEdit(item)} />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add modal */}
      <Modal
        title="新增待办"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); resetAddForm() }}
        okText="添加"
        cancelText="取消"
        width={480}
        okButtonProps={{ disabled: !inputText.trim() }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            placeholder="待办内容"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={() => { if (inputText.trim()) handleAdd() }}
            autoFocus
          />
          <Input.TextArea
            placeholder="备注（可选）"
            value={inputNote}
            onChange={(e) => setInputNote(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Select
              size="small"
              placeholder="优先级"
              value={inputPriority}
              onChange={(v) => setInputPriority(v)}
              allowClear
              style={{ width: 100 }}
              options={[
                { label: '高', value: 'high' },
                { label: '中', value: 'medium' },
                { label: '低', value: 'low' },
              ]}
            />
            <DatePicker
              size="small"
              placeholder="截止日期"
              value={inputDueDate}
              onChange={(d) => setInputDueDate(d)}
              style={{ width: 140 }}
            />
            <DatePicker
              size="small"
              showTime
              placeholder="提醒时间"
              value={inputReminder}
              onChange={(d) => setInputReminder(d)}
              style={{ width: 180 }}
            />
          </div>
        </div>
      </Modal>

      {/* Reminder modal */}
      <Modal
        title="设置提醒时间"
        open={!!settingReminderId}
        onOk={handleSaveReminder}
        onCancel={() => { setSettingReminderId(null); setReminderValue(null) }}
        okText="确定"
        cancelText="取消"
        width={360}
      >
        <DatePicker
          showTime
          value={reminderValue}
          onChange={(d) => setReminderValue(d)}
          placeholder="选择提醒时间"
          style={{ width: '100%' }}
        />
      </Modal>

      {/* Due date modal */}
      <Modal
        title="设置截止日期"
        open={!!settingDueDateId}
        onOk={handleSaveDueDate}
        onCancel={() => { setSettingDueDateId(null); setDueDateValue(null) }}
        okText="确定"
        cancelText="取消"
        width={360}
      >
        <DatePicker
          value={dueDateValue}
          onChange={(d) => setDueDateValue(d)}
          placeholder="选择截止日期"
          style={{ width: '100%' }}
        />
      </Modal>
    </div>
  )
}
