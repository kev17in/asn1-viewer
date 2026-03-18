import { useState, useEffect, useCallback, useMemo } from 'react'
import { Input, Button, Tag, Tooltip, Empty, message, Modal, Segmented, Popover, Spin, Pagination } from 'antd'
import {
  CopyOutlined, DeleteOutlined, ClearOutlined, SearchOutlined,
  ClockCircleOutlined, ReloadOutlined, StarOutlined, StarFilled,
  ExportOutlined, TagOutlined, PictureOutlined, FileOutlined,
} from '@ant-design/icons'

interface ClipboardItem {
  text: string
  time: number
  favorite?: boolean
  label?: string
  imageFile?: string
  imageThumbnail?: string
  files?: string[]
}

const PRESET_LABELS = [
  { text: '重要', color: '#f5222d' },
  { text: '工作', color: '#1890ff' },
  { text: '临时', color: '#faad14' },
  { text: '参考', color: '#52c41a' },
  { text: '密钥', color: '#722ed1' },
  { text: '地址', color: '#13c2c2' },
]

interface Props {
  onStatusChange: (s: string) => void
}

type ClipboardType = 'hex' | 'base64' | 'json' | 'text' | 'image' | 'file'
type TypeFilter = 'all' | ClipboardType | 'favorite'

function detectTextType(text: string): Exclude<ClipboardType, 'image'> {
  if (!text) return 'text'
  const trimmed = text.trim()
  if (/^[\[{]/.test(trimmed)) {
    try { JSON.parse(trimmed); return 'json' } catch { /* not json */ }
  }
  const hexClean = trimmed.replace(/[\s:.-]/g, '')
  if (/^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length >= 4 && hexClean.length % 2 === 0) return 'hex'
  if (/^[A-Za-z0-9+/\s]+=*$/.test(trimmed) && trimmed.length >= 8) {
    try { if (atob(trimmed.replace(/\s/g, '')).length > 0) return 'base64' } catch { /* not b64 */ }
  }
  return 'text'
}

function detectType(item: ClipboardItem): ClipboardType {
  if (item.files && item.files.length > 0) return 'file'
  if (item.imageFile) return 'image'
  return detectTextType(item.text)
}

function typeLabel(t: ClipboardType): string {
  return { hex: 'HEX', base64: 'Base64', json: 'JSON', text: '文本', image: '图片', file: '文件' }[t]
}

function typeColor(t: ClipboardType): string {
  return { hex: 'orange', base64: 'purple', json: 'blue', text: 'default', image: 'green', file: 'cyan' }[t]
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function LabelPicker({ current, onSelect }: { current?: string; onSelect: (label: string | undefined) => void }) {
  const [customInput, setCustomInput] = useState('')
  const isCustom = current && !PRESET_LABELS.some((l) => l.text === current)

  return (
    <div className="cb-label-picker">
      {PRESET_LABELS.map((l) => (
        <Tag
          key={l.text}
          color={l.color}
          className={`cb-label-option ${current === l.text ? 'cb-label-active' : ''}`}
          onClick={() => onSelect(current === l.text ? undefined : l.text)}
        >
          {l.text}
        </Tag>
      ))}
      {isCustom && (
        <Tag color="geekblue" className="cb-label-option cb-label-active">
          {current}
        </Tag>
      )}
      <div className="cb-label-custom-row">
        <Input
          size="small"
          placeholder="自定义标签"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onPressEnter={() => {
            const val = customInput.trim()
            if (val) { onSelect(val); setCustomInput('') }
          }}
          style={{ width: 100 }}
        />
        <Button
          size="small"
          type="primary"
          disabled={!customInput.trim()}
          onClick={() => {
            const val = customInput.trim()
            if (val) { onSelect(val); setCustomInput('') }
          }}
        >
          确定
        </Button>
      </div>
      {current && (
        <Button type="link" size="small" onClick={() => onSelect(undefined)} style={{ padding: '0 4px' }}>
          清除
        </Button>
      )}
    </div>
  )
}

const PAGE_SIZE = 20

export default function ClipboardHistoryTab({ onStatusChange }: Props) {
  const [history, setHistory] = useState<ClipboardItem[]>([])
  const [search, setSearch] = useState('')
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [fullImages, setFullImages] = useState<Record<string, string>>({})
  const [loadingImage, setLoadingImage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const loadHistory = useCallback(async () => {
    const data = await window.electronAPI?.getClipboardHistory()
    if (data) setHistory(data)
  }, [])

  useEffect(() => {
    loadHistory()
    const cleanup = window.electronAPI?.onClipboardHistoryChanged((updated) => {
      setHistory(updated)
    })
    return () => { cleanup?.() }
  }, [loadHistory])

  const filtered = useMemo(() => {
    let items = history
    if (typeFilter === 'favorite') {
      items = items.filter((item) => item.favorite)
    } else if (typeFilter === 'image') {
      items = items.filter((item) => !!item.imageFile)
    } else if (typeFilter === 'file') {
      items = items.filter((item) => item.files && item.files.length > 0)
    } else if (typeFilter !== 'all') {
      items = items.filter((item) => !item.imageFile && !item.files?.length && detectTextType(item.text) === typeFilter)
    }
    if (search.trim()) {
      const kw = search.toLowerCase()
      items = items.filter((item) => item.text.toLowerCase().includes(kw))
    }
    return items
  }, [history, search, typeFilter])

  useEffect(() => {
    setCurrentPage(1)
    setExpandedIndex(null)
  }, [search, typeFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages))
  const pagedItems = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE)
  const pageOffset = (safeCurrentPage - 1) * PAGE_SIZE

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    if (item.imageFile) {
      await window.electronAPI?.copyImageToClipboard(item.imageFile)
      message.success('已复制图片')
      onStatusChange('已复制图片到剪贴板')
    } else if (item.files && item.files.length > 0) {
      await window.electronAPI?.copyToClipboard(item.files.join('\n'))
      message.success('已复制文件路径')
      onStatusChange('已复制文件路径到剪贴板')
    } else {
      await window.electronAPI?.copyToClipboard(item.text)
      message.success('已复制')
      onStatusChange('已复制到剪贴板')
    }
  }, [onStatusChange])

  const loadFullImage = useCallback(async (filename: string) => {
    if (fullImages[filename]) return
    setLoadingImage(filename)
    const dataUrl = await window.electronAPI?.getClipboardImage(filename)
    if (dataUrl) setFullImages((prev) => ({ ...prev, [filename]: dataUrl }))
    setLoadingImage(null)
  }, [fullImages])

  const handleDelete = useCallback(async (index: number) => {
    const realIndex = history.indexOf(filtered[index])
    if (realIndex >= 0) {
      const updated = await window.electronAPI?.deleteClipboardHistoryItem(realIndex)
      if (updated) setHistory(updated)
      onStatusChange('已删除')
    }
  }, [history, filtered, onStatusChange])

  const handleToggleFavorite = useCallback(async (index: number) => {
    const realIndex = history.indexOf(filtered[index])
    if (realIndex >= 0) {
      const updated = await window.electronAPI?.toggleClipboardFavorite(realIndex)
      if (updated) setHistory(updated)
      const item = history[realIndex]
      onStatusChange(item?.favorite ? '已取消收藏' : '已收藏')
    }
  }, [history, filtered, onStatusChange])

  const handleSetLabel = useCallback(async (index: number, label: string | undefined) => {
    const realIndex = history.indexOf(filtered[index])
    if (realIndex >= 0) {
      const updated = await window.electronAPI?.setClipboardLabel(realIndex, label)
      if (updated) setHistory(updated)
      onStatusChange(label ? `已标记: ${label}` : '已移除标签')
    }
  }, [history, filtered, onStatusChange])

  const handleClearAll = useCallback(() => {
    if (history.length === 0) return
    Modal.confirm({
      title: '清空剪贴板历史',
      content: `确定要清空全部 ${history.length} 条记录吗？此操作不可撤销。`,
      okText: '清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const updated = await window.electronAPI?.clearClipboardHistory()
        if (updated) setHistory(updated)
        setExpandedIndex(null)
        onStatusChange('已清空剪贴板历史')
      },
    })
  }, [history, onStatusChange])

  const handleExport = useCallback(async () => {
    const ok = await window.electronAPI?.exportClipboardHistory()
    if (ok) {
      message.success('已导出')
      onStatusChange('剪贴板历史已导出')
    }
  }, [onStatusChange])

  const favoriteCount = useMemo(() => history.filter((i) => i.favorite).length, [history])
  const imageCount = useMemo(() => history.filter((i) => !!i.imageFile).length, [history])
  const fileCount = useMemo(() => history.filter((i) => i.files && i.files.length > 0).length, [history])

  return (
    <div className="cb-page">
      {/* Toolbar */}
      <div className="cb-toolbar">
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索剪贴板内容..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ flex: 1, maxWidth: 400 }}
        />
        <div className="cb-toolbar-right">
          <span className="cb-count">{filtered.length} / {history.length} 条</span>
          <Tooltip title="刷新">
            <Button size="small" icon={<ReloadOutlined />} onClick={loadHistory} />
          </Tooltip>
          <Tooltip title="导出">
            <Button size="small" icon={<ExportOutlined />} onClick={handleExport} disabled={history.length === 0} />
          </Tooltip>
          <Tooltip title="清空全部">
            <Button size="small" danger icon={<ClearOutlined />} onClick={handleClearAll} disabled={history.length === 0} />
          </Tooltip>
        </div>
      </div>

      {/* Type filter */}
      <div className="cb-toolbar" style={{ paddingTop: 0 }}>
        <Segmented
          size="small"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { label: '全部', value: 'all' },
            { label: `收藏 ${favoriteCount}`, value: 'favorite' },
            { label: `图片 ${imageCount}`, value: 'image' },
            { label: `文件 ${fileCount}`, value: 'file' },
            { label: 'HEX', value: 'hex' },
            { label: 'Base64', value: 'base64' },
            { label: 'JSON', value: 'json' },
            { label: '文本', value: 'text' },
          ]}
        />
      </div>

      {/* List */}
      <div className="cb-list">
        {filtered.length === 0 ? (
          <div className="cb-empty">
            <Empty description={search ? '没有匹配的记录' : '暂无剪贴板历史'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          pagedItems.map((item, i) => {
            const globalIdx = pageOffset + i
            const type = detectType(item)
            const isExpanded = expandedIndex === globalIdx
            const isImage = !!item.imageFile
            const isFile = !!(item.files && item.files.length > 0)
            const preview = isImage || isFile ? '' : (item.text.length > 200 ? item.text.slice(0, 200) + '...' : item.text)
            const labelColor = PRESET_LABELS.find((l) => l.text === item.label)?.color
            return (
              <div
                key={`${item.time}-${globalIdx}`}
                className={`cb-item ${isExpanded ? 'cb-item-expanded' : ''} ${item.favorite ? 'cb-item-favorite' : ''}`}
              >
                <div
                  className="cb-item-header"
                  onClick={() => {
                    if (window.getSelection()?.toString()) return
                    const newIdx = isExpanded ? null : globalIdx
                    setExpandedIndex(newIdx)
                    if (newIdx !== null && item.imageFile) loadFullImage(item.imageFile)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cb-item-meta">
                    <Tag color={typeColor(type)} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {isImage ? <><PictureOutlined style={{ marginRight: 2 }} />{typeLabel(type)}</> : isFile ? <><FileOutlined style={{ marginRight: 2 }} />{typeLabel(type)}</> : typeLabel(type)}
                    </Tag>
                    {item.label && (
                      <Tag
                        color={labelColor}
                        closable
                        onClose={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleSetLabel(globalIdx, undefined)
                        }}
                        style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
                      >
                        {item.label}
                      </Tag>
                    )}
                    <span className="cb-item-time">
                      <ClockCircleOutlined style={{ fontSize: 10, marginRight: 3 }} />
                      <Tooltip title={formatTime(item.time)}>
                        <span>{relativeTime(item.time)}</span>
                      </Tooltip>
                    </span>
                    <span className="cb-item-size">{isImage ? item.text : isFile ? `${item.files!.length} 个文件` : `${item.text.length} 字符`}</span>
                  </div>
                  <div className="cb-item-actions" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={item.favorite ? '取消收藏' : '收藏'}>
                      <Button
                        type="text"
                        size="small"
                        icon={item.favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                        onClick={() => handleToggleFavorite(globalIdx)}
                      />
                    </Tooltip>
                    {item.favorite && (
                      <Popover
                        trigger="click"
                        placement="bottomRight"
                        content={
                          <LabelPicker
                            current={item.label}
                            onSelect={(label) => handleSetLabel(globalIdx, label)}
                          />
                        }
                      >
                        <Tooltip title="标签">
                          <Button
                            type="text"
                            size="small"
                            icon={<TagOutlined style={item.label ? { color: labelColor } : undefined} />}
                          />
                        </Tooltip>
                      </Popover>
                    )}
                    <Tooltip title="复制">
                      <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(globalIdx)} />
                    </Tooltip>
                  </div>
                </div>
                <div className="cb-item-content">
                  {isFile ? (
                    <div style={{ fontFamily: 'Consolas, monospace', fontSize: 11, lineHeight: 1.6, wordBreak: 'break-all' }}>
                      {(isExpanded ? item.files! : item.files!.slice(0, 2)).map((f, fi) => (
                        <div key={fi}><FileOutlined style={{ marginRight: 4, fontSize: 10, opacity: 0.6 }} />{f}</div>
                      ))}
                      {!isExpanded && item.files!.length > 2 && (
                        <div style={{ opacity: 0.5 }}>...还有 {item.files!.length - 2} 个文件</div>
                      )}
                    </div>
                  ) : isImage ? (
                    <div className="cb-item-image-wrapper">
                      {isExpanded ? (
                        item.imageFile && fullImages[item.imageFile] ? (
                          <img src={fullImages[item.imageFile]} className="cb-item-image-full" alt={item.text} />
                        ) : (
                          <div className="cb-item-image-loading"><Spin size="small" /><span>加载中...</span></div>
                        )
                      ) : (
                        item.imageThumbnail ? (
                          <img src={item.imageThumbnail} className="cb-item-image-thumb" alt={item.text} />
                        ) : (
                          <div className="cb-item-image-placeholder"><PictureOutlined style={{ fontSize: 24 }} /><span>{item.text}</span></div>
                        )
                      )}
                    </div>
                  ) : (
                    isExpanded ? item.text : preview
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="cb-pagination">
          <Pagination
            size="small"
            current={safeCurrentPage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            showSizeChanger={false}
            showTotal={(total) => `共 ${total} 条`}
            onChange={(page) => { setCurrentPage(page); setExpandedIndex(null) }}
          />
        </div>
      )}
    </div>
  )
}
