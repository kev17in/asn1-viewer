import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button, Input, Tree, Tooltip, Divider, Menu, Dropdown, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  FormatPainterOutlined, ClearOutlined, CopyOutlined, CompressOutlined,
  ShrinkOutlined, ArrowsAltOutlined, SwapOutlined, SortAscendingOutlined,
  LoginOutlined, FontSizeOutlined, SearchOutlined, HistoryOutlined, DeleteOutlined,
} from '@ant-design/icons'
import JSONBig from 'json-bigint'

// Use BigInt (not storeAsString) so stringify outputs bare numbers, not quoted strings
const JSONBigInt = JSONBig({ useNativeBigInt: true })

/** Parse JSON safely, preserving large integers without precision loss.
 *  Integers beyond ±2^53-1 are returned as BigInt values. */
function safeParse(text: string): unknown {
  return JSONBigInt.parse(text)
}

/** Stringify back to JSON. BigInt values are serialized as bare number literals.
 *  NOTE: Do NOT fall back to JSON.stringify — it throws on BigInt values. */
function safeStringify(value: unknown, indent?: number): string {
  return JSONBigInt.stringify(value, null, indent) ?? ''
}

const { TextArea } = Input

interface Props {
  onStatusChange: (s: string) => void
  isActive?: boolean
}

const MAX_HISTORY = 20
const MAX_PREVIEW_LEN = 80
const MAX_FULL_DATA_LEN = 10000

interface JsonHistoryItem {
  data: string
  fullData: string
  time: number
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString()
}

interface JsonTreeNode {
  title: string
  key: string
  children?: JsonTreeNode[]
  dataPath: (string | number)[]
  isLeaf?: boolean
}

// ── Utility: JSON tree building ──

let keyCounter = 0

function jsonToTree(data: unknown, label: string, parentKey: string, dataPath: (string | number)[] = []): JsonTreeNode {
  const key = `${parentKey}-${keyCounter++}`

  if (data === null || data === undefined) {
    return { title: `${label}: null`, key, dataPath, isLeaf: true }
  }

  if (typeof data !== 'object') {
    const valueStr = typeof data === 'string' ? `"${data}"` : String(data)
    return { title: `${label}: ${valueStr}`, key, dataPath, isLeaf: true }
  }

  // BigInt from json-bigint is not typeof 'object', but guard just in case
  if (typeof (data as unknown) === 'bigint') {
    return { title: `${label}: ${String(data)}`, key, dataPath, isLeaf: true }
  }

  if (Array.isArray(data)) {
    return {
      title: `${label} [${data.length} items]`,
      key,
      dataPath,
      children: data.map((item, i) => jsonToTree(item, `[${i}]`, key, [...dataPath, i])),
    }
  }

  const entries = Object.entries(data)
  return {
    title: `${label} {${entries.length} fields}`,
    key,
    dataPath,
    children: entries.map(([k, v]) => jsonToTree(v, k, key, [...dataPath, k])),
  }
}

function collectAllKeys(nodes: JsonTreeNode[]): string[] {
  const keys: string[] = []
  for (const n of nodes) {
    keys.push(n.key)
    if (n.children) keys.push(...collectAllKeys(n.children))
  }
  return keys
}

// ── Utility: recursive key sort ──

function sortKeysRecursive(data: unknown): unknown {
  if (data === null || data === undefined || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(sortKeysRecursive)
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(data as Record<string, unknown>).sort()) {
    sorted[k] = sortKeysRecursive((data as Record<string, unknown>)[k])
  }
  return sorted
}

// ── Utility: JSONPath query ──

function queryJsonPath(data: unknown, path: string): { found: boolean; value: unknown } {
  const segments = parsePath(path)
  if (!segments) return { found: false, value: undefined }

  let current: unknown = data
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { found: false, value: undefined }
    }
    if (seg.type === 'key') {
      if (!Object.prototype.hasOwnProperty.call(current, seg.value)) {
        return { found: false, value: undefined }
      }
      current = (current as Record<string, unknown>)[seg.value]
    } else {
      if (!Array.isArray(current)) return { found: false, value: undefined }
      const idx = parseInt(seg.value, 10)
      if (idx < 0 || idx >= current.length) return { found: false, value: undefined }
      current = current[idx]
    }
  }
  return { found: true, value: current }
}

function parsePath(path: string): { type: 'key' | 'index'; value: string }[] | null {
  const result: { type: 'key' | 'index'; value: string }[] = []
  let rest = path.trim()
  if (!rest) return null
  if (rest.startsWith('$.')) rest = rest.slice(2)
  else if (rest.startsWith('$')) rest = rest.slice(1)

  while (rest.length > 0) {
    if (rest.startsWith('[')) {
      const end = rest.indexOf(']')
      if (end === -1) return null
      const inner = rest.slice(1, end).trim()
      if (/^\d+$/.test(inner)) {
        result.push({ type: 'index', value: inner })
      } else {
        const unquoted = inner.replace(/^['"]|['"]$/g, '')
        result.push({ type: 'key', value: unquoted })
      }
      rest = rest.slice(end + 1)
      if (rest.startsWith('.')) rest = rest.slice(1)
    } else {
      const match = rest.match(/^([^.[]+)/)
      if (!match) return null
      result.push({ type: 'key', value: match[1] })
      rest = rest.slice(match[1].length)
      if (rest.startsWith('.')) rest = rest.slice(1)
    }
  }
  return result.length > 0 ? result : null
}

// ── Utility: JSON stats ──

interface JsonStats {
  fields: number
  maxDepth: number
  objects: number
  arrays: number
  strings: number
  numbers: number
  booleans: number
  nulls: number
}

function computeStats(data: unknown, depth: number = 1): JsonStats {
  const stats: JsonStats = { fields: 0, maxDepth: depth, objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0 }
  if (data === null || data === undefined) { stats.nulls = 1; return stats }
  if (typeof data === 'string') { stats.strings = 1; return stats }
  if (typeof data === 'number' || typeof data === 'bigint') { stats.numbers = 1; return stats }
  if (typeof data === 'boolean') { stats.booleans = 1; return stats }
  if (Array.isArray(data)) {
    stats.arrays = 1
    for (const item of data) {
      const sub = computeStats(item, depth + 1)
      mergeStats(stats, sub)
    }
    return stats
  }
  stats.objects = 1
  const entries = Object.entries(data as Record<string, unknown>)
  stats.fields = entries.length
  for (const [, v] of entries) {
    const sub = computeStats(v, depth + 1)
    mergeStats(stats, sub)
  }
  return stats
}

function mergeStats(target: JsonStats, source: JsonStats) {
  target.fields += source.fields
  target.maxDepth = Math.max(target.maxDepth, source.maxDepth)
  target.objects += source.objects
  target.arrays += source.arrays
  target.strings += source.strings
  target.numbers += source.numbers
  target.booleans += source.booleans
  target.nulls += source.nulls
}

function setValueAtPath(data: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (Array.isArray(data)) {
    return data.map((item, i) => i === head ? setValueAtPath(item, rest, value) : item)
  }
  if (typeof data === 'object' && data !== null) {
    return { ...data as Record<string, unknown>, [head]: setValueAtPath((data as Record<string, unknown>)[head as string], rest, value) }
  }
  return data
}

function renameKeyAtPath(data: unknown, parentPath: (string | number)[], oldKey: string, newKey: string): unknown {
  if (parentPath.length === 0) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return data
    const obj = data as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const k of Object.keys(obj)) {
      result[k === oldKey ? newKey : k] = obj[k]
    }
    return result
  }
  const [head, ...rest] = parentPath
  if (Array.isArray(data)) {
    return data.map((item, i) => i === head ? renameKeyAtPath(item, rest, oldKey, newKey) : item)
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    return { ...obj, [head]: renameKeyAtPath(obj[head as string], rest, oldKey, newKey) }
  }
  return data
}

function parseInputValue(input: string): unknown {
  const trimmed = input.trim()
  if (trimmed === 'null') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed !== '' && /^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isSafeInteger(n)) return n
    try { return safeParse(trimmed) } catch { /* fall through */ }
  }
  if (trimmed !== '' && !isNaN(Number(trimmed))) return Number(trimmed)
  return input
}

// ── Component ──

export default function JsonTab({ onStatusChange, isActive }: Props) {
  const [input, setInput] = useState('')
  const [formatted, setFormatted] = useState('')
  const [treeData, setTreeData] = useState<JsonTreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [parsedData, setParsedData] = useState<unknown>(undefined)
  const [stats, setStats] = useState<JsonStats | null>(null)

  const [queryPath, setQueryPath] = useState('')
  const [queryResult, setQueryResult] = useState<string | null>(null)

  const [leftRatio, setLeftRatio] = useState(0.5)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: JsonTreeNode } | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingNodePath, setEditingNodePath] = useState<(string | number)[]>([])
  const [editingKeyNameKey, setEditingKeyNameKey] = useState<string | null>(null)
  const [editKeyNameValue, setEditKeyNameValue] = useState('')
  const [editingKeyNamePath, setEditingKeyNamePath] = useState<(string | number)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const [history, setHistory] = useState<JsonHistoryItem[]>([])

  const hasInput = useMemo(() => !!input.trim(), [input])

  useEffect(() => {
    if (isActive === false) return
    const handler = (e: Event) => {
      const { tab, content } = (e as CustomEvent).detail
      if (tab === 'json' && content) {
        setInput(content)
        onStatusChange('已从悬浮按钮接收剪贴板内容')
      }
    }
    window.addEventListener('float-clipboard-input', handler)
    return () => window.removeEventListener('float-clipboard-input', handler)
  }, [onStatusChange, isActive])

  useEffect(() => {
    window.electronAPI?.getConfig('jsonHistory').then((val) => {
      if (Array.isArray(val)) setHistory(val)
    })
  }, [])

  // ── Format ──
  const handleFormat = () => {
    if (!hasInput) { message.warning('请输入 JSON 数据'); return }
    try {
      const parsed = safeParse(input.trim())
      const prettyJson = safeStringify(parsed, 2)
      setInput(prettyJson)
      setFormatted(prettyJson)
      setParsedData(parsed)
      setStats(computeStats(parsed))
      keyCounter = 0
      const tree = jsonToTree(parsed, 'root', 'json')
      setTreeData([tree])
      setExpandedKeys([tree.key])
      onStatusChange('JSON 格式化成功')
      const raw = input.trim()
      const preview = raw.length > MAX_PREVIEW_LEN ? raw.slice(0, MAX_PREVIEW_LEN) + '…' : raw
      const fullData = raw.length > MAX_FULL_DATA_LEN ? raw.slice(0, MAX_FULL_DATA_LEN) : raw
      const historyItem: JsonHistoryItem = { data: preview, fullData, time: Date.now() }
      setHistory((prev) => {
        if (prev.length > 0 && prev[0].fullData === fullData) return prev
        const next = [historyItem, ...prev].slice(0, MAX_HISTORY)
        window.electronAPI?.setConfig('jsonHistory', next)
        return next
      })
    } catch (err: any) {
      message.error('JSON 格式错误: ' + err.message)
      onStatusChange('JSON 格式错误')
    }
  }

  // ── Compress ──
  const handleCompress = () => {
    if (!hasInput) return
    try {
      const parsed = safeParse(input.trim())
      setInput(safeStringify(parsed))
      onStatusChange('JSON 已压缩')
    } catch (err: any) { message.error('JSON 格式错误: ' + err.message) }
  }

  // ── Sort keys ──
  const handleSortKeys = () => {
    if (!hasInput) return
    try {
      const parsed = safeParse(input.trim())
      const sorted = sortKeysRecursive(parsed)
      const prettyJson = safeStringify(sorted, 2)
      setInput(prettyJson)
      setFormatted(prettyJson)
      setParsedData(sorted)
      setStats(computeStats(sorted))
      keyCounter = 0
      const tree = jsonToTree(sorted, 'root', 'json')
      setTreeData([tree])
      setExpandedKeys([tree.key])
      onStatusChange('JSON 键已排序')
    } catch (err: any) { message.error('JSON 格式错误: ' + err.message) }
  }

  // ── Escape ──
  const handleEscape = () => {
    if (!hasInput) return
    const escaped = JSON.stringify(input)
    setInput(escaped)
    onStatusChange('已转义为 JSON 字符串')
  }

  // ── Unescape ──
  const handleUnescape = () => {
    if (!hasInput) return
    try {
      let text = input.trim()
      if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = JSON.parse(text)
      } else {
        text = text.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
          .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }
      setInput(text)
      onStatusChange('已去除转义')
    } catch {
      message.error('去除转义失败，请检查数据格式')
    }
  }

  // ── Unicode escape ──
  const handleUnicodeEscape = () => {
    if (!hasInput) return
    const result = input.replace(/[^\x00-\x7F]/g, (ch) => {
      return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
    })
    setInput(result)
    onStatusChange('Unicode 转义完成')
  }

  // ── Unicode unescape ──
  const handleUnicodeUnescape = () => {
    if (!hasInput) return
    const result = input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16))
    })
    setInput(result)
    onStatusChange('Unicode 反转义完成')
  }

  // ── Clear ──
  const handleClear = () => {
    setInput(''); setFormatted(''); setTreeData([]); setParsedData(undefined)
    setStats(null); setQueryPath(''); setQueryResult(null)
    onStatusChange('已清空')
  }

  // ── Copy ──
  const handleCopy = () => {
    if (formatted) {
      navigator.clipboard.writeText(formatted)
      message.success('已复制格式化 JSON')
    }
  }

  // ── Tree edit ──
  const handleTreeDoubleClick = (node: JsonTreeNode) => {
    if (!node.isLeaf || parsedData === undefined) return
    const title = node.title
    const colonIdx = title.indexOf(': ')
    if (colonIdx === -1) return
    const raw = title.substring(colonIdx + 2)
    const display = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
    setEditingKey(node.key)
    setEditingNodePath(node.dataPath)
    setEditValue(display)
  }

  const handleTreeEditConfirm = () => {
    if (editingKey === null || parsedData === undefined) { setEditingKey(null); return }
    const newValue = parseInputValue(editValue)
    const newData = setValueAtPath(parsedData, editingNodePath, newValue)
    const prettyJson = safeStringify(newData, 2)
    setInput(prettyJson)
    setFormatted(prettyJson)
    setParsedData(newData)
    setStats(computeStats(newData))
    keyCounter = 0
    const tree = jsonToTree(newData, 'root', 'json')
    setTreeData([tree])
    setExpandedKeys((prev) => prev)
    setEditingKey(null)
    setEditValue('')
    onStatusChange('已修改值')
  }

  const handleTreeEditCancel = () => {
    setEditingKey(null)
    setEditValue('')
  }

  const isKeyRenameable = (node: JsonTreeNode): boolean => {
    return node.dataPath.length > 0 && typeof node.dataPath[node.dataPath.length - 1] === 'string'
  }

  const handleKeyNameDoubleClick = (node: JsonTreeNode) => {
    if (!isKeyRenameable(node) || parsedData === undefined) return
    const title = node.title
    const colonIdx = title.indexOf(': ')
    const bracketIdx = title.indexOf(' [')
    const braceIdx = title.indexOf(' {')
    let keyName = title
    if (colonIdx !== -1) keyName = title.substring(0, colonIdx)
    else if (bracketIdx !== -1) keyName = title.substring(0, bracketIdx)
    else if (braceIdx !== -1) keyName = title.substring(0, braceIdx)
    setEditingKeyNameKey(node.key)
    setEditingKeyNamePath(node.dataPath)
    setEditKeyNameValue(keyName)
  }

  const handleKeyNameEditConfirm = () => {
    if (editingKeyNameKey === null || parsedData === undefined) { setEditingKeyNameKey(null); return }
    const newName = editKeyNameValue.trim()
    if (!newName) {
      message.warning('键名不能为空')
      return
    }
    const oldKey = editingKeyNamePath[editingKeyNamePath.length - 1] as string
    if (newName === oldKey) {
      setEditingKeyNameKey(null)
      setEditKeyNameValue('')
      return
    }
    const parentPath = editingKeyNamePath.slice(0, -1)
    const newData = renameKeyAtPath(parsedData, parentPath, oldKey, newName)
    const prettyJson = safeStringify(newData, 2)
    setInput(prettyJson)
    setFormatted(prettyJson)
    setParsedData(newData)
    setStats(computeStats(newData))
    keyCounter = 0
    const tree = jsonToTree(newData, 'root', 'json')
    setTreeData([tree])
    setExpandedKeys((prev) => prev)
    setEditingKeyNameKey(null)
    setEditKeyNameValue('')
    onStatusChange('已修改键名')
  }

  const handleKeyNameEditCancel = () => {
    setEditingKeyNameKey(null)
    setEditKeyNameValue('')
  }

  // ── JSONPath query ──
  const handleQuery = () => {
    if (!queryPath.trim()) { setQueryResult(null); return }
    if (parsedData === undefined) { message.warning('请先格式化 JSON'); return }
    const { found, value } = queryJsonPath(parsedData, queryPath.trim())
    if (found) {
      const display = typeof value === 'object' ? safeStringify(value, 2) : String(value)
      setQueryResult(display)
      onStatusChange(`查询成功: ${queryPath.trim()}`)
    } else {
      setQueryResult('未找到匹配的路径')
      onStatusChange('路径不存在')
    }
  }

  // ── Drop ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => setInput(reader.result as string)
      reader.readAsText(file)
    }
  }, [])

  const getNodeTextValue = (node: JsonTreeNode): string => {
    const title = node.title
    const colonIdx = title.indexOf(': ')
    if (colonIdx !== -1 && !node.children?.length) {
      const raw = title.substring(colonIdx + 2)
      if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1)
      return raw
    }
    if (node.children?.length && parsedData !== undefined) {
      const pathSegments = extractPathFromKey(node.key)
      const { found, value } = queryJsonPath(parsedData, pathSegments)
      if (found) return safeStringify(value, 2)
    }
    return title
  }

  const extractPathFromKey = (key: string): string => {
    const findPath = (nodes: JsonTreeNode[], targetKey: string, path: string[]): string[] | null => {
      for (const n of nodes) {
        const label = n.title.split(/[\s:{[]/)[0]
        const currentPath = [...path, label]
        if (n.key === targetKey) return currentPath
        if (n.children) {
          const result = findPath(n.children, targetKey, currentPath)
          if (result) return result
        }
      }
      return null
    }
    const segments = findPath(treeData, key, [])
    if (!segments || segments.length <= 1) return '$'
    return '$.' + segments.slice(1).map(s => {
      if (s.startsWith('[')) return s
      return s
    }).join('.')
  }

  const buildJsonContextMenuItems = (node: JsonTreeNode): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: 'copy-value',
        label: '复制值',
        icon: <CopyOutlined />,
        onClick: () => {
          const val = getNodeTextValue(node)
          navigator.clipboard.writeText(val)
          message.success('已复制')
          setContextMenu(null)
        },
      },
      {
        key: 'copy-key',
        label: '复制键名',
        icon: <CopyOutlined />,
        onClick: () => {
          const title = node.title
          const colonIdx = title.indexOf(': ')
          const bracketIdx = title.indexOf(' [')
          const braceIdx = title.indexOf(' {')
          let keyName = title
          if (colonIdx !== -1) keyName = title.substring(0, colonIdx)
          else if (bracketIdx !== -1) keyName = title.substring(0, bracketIdx)
          else if (braceIdx !== -1) keyName = title.substring(0, braceIdx)
          navigator.clipboard.writeText(keyName)
          message.success('已复制键名')
          setContextMenu(null)
        },
      },
      {
        key: 'copy-line',
        label: '复制整行',
        icon: <CopyOutlined />,
        onClick: () => {
          navigator.clipboard.writeText(node.title)
          message.success('已复制')
          setContextMenu(null)
        },
      },
    ]
    return items
  }

  const handleHistoryRestore = (item: JsonHistoryItem) => {
    setInput(item.fullData)
    onStatusChange('已从历史恢复')
  }

  const handleDeleteHistoryItem = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory((prev) => {
      const next = prev.filter((_, i) => i !== index)
      window.electronAPI?.setConfig('jsonHistory', next)
      return next
    })
  }

  const handleClearHistory = () => {
    setHistory([])
    window.electronAPI?.setConfig('jsonHistory', [])
    message.success('历史已清空')
  }

  const historyMenuItems: MenuProps['items'] = [
    ...history.map((item, i) => ({
      key: `h-${i}`,
      label: (
        <div className="parse-history-item">
          <div className="parse-history-item-content">
            <div className="parse-history-item-data">{item.data}</div>
            <div className="parse-history-item-meta">
              <span>{timeAgo(item.time)}</span>
            </div>
          </div>
          <span className="parse-history-item-delete" title="删除" onClick={(e) => handleDeleteHistoryItem(i, e)}>
            <DeleteOutlined />
          </span>
        </div>
      ),
      onClick: () => handleHistoryRestore(item),
    })),
    ...(history.length > 0 ? [
      { type: 'divider' as const, key: 'div' },
      { key: 'clear', danger: true, label: '清空历史', onClick: handleClearHistory },
    ] : []),
  ]

  // ── Resize ──
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      setLeftRatio(Math.max(0.2, Math.min(0.8, x / rect.width)))
    }

    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div className="json-page" onClick={() => contextMenu && setContextMenu(null)}>
      {/* ── Toolbar ── */}
      <div className="json-toolbar">
        <div className="json-toolbar-group">
          <Button type="primary" size="small" icon={<FormatPainterOutlined />} onClick={handleFormat} disabled={!hasInput}>格式化</Button>
          <Button size="small" icon={<CompressOutlined />} onClick={handleCompress} disabled={!hasInput}>压缩</Button>
          <Button size="small" icon={<SortAscendingOutlined />} onClick={handleSortKeys} disabled={!hasInput}>排序</Button>
        </div>
        <Divider type="vertical" className="json-toolbar-divider" />
        <div className="json-toolbar-group">
          <Tooltip title="将内容转为 JSON 转义字符串">
            <Button size="small" icon={<LoginOutlined />} onClick={handleEscape} disabled={!hasInput}>转义</Button>
          </Tooltip>
          <Tooltip title="去除 JSON 转义">
            <Button size="small" icon={<SwapOutlined />} onClick={handleUnescape} disabled={!hasInput}>去转义</Button>
          </Tooltip>
          <Tooltip title="中文等非 ASCII 字符 → \\uXXXX">
            <Button size="small" icon={<FontSizeOutlined />} onClick={handleUnicodeEscape} disabled={!hasInput}>Unicode 转义</Button>
          </Tooltip>
          <Tooltip title="\\uXXXX → 可读字符">
            <Button size="small" icon={<FontSizeOutlined />} onClick={handleUnicodeUnescape} disabled={!hasInput}>Unicode 反转义</Button>
          </Tooltip>
        </div>
        <Divider type="vertical" className="json-toolbar-divider" />
        <div className="json-toolbar-group">
          <Button size="small" icon={<ClearOutlined />} onClick={handleClear}>清空</Button>
        </div>
        <Divider type="vertical" className="json-toolbar-divider" />
        <div className="json-toolbar-group">
          <Dropdown
            menu={{ items: historyMenuItems, style: { maxHeight: 420, overflowY: 'auto' } }}
            trigger={['click']}
            disabled={history.length === 0}
          >
            <Button size="small" icon={<HistoryOutlined />} disabled={history.length === 0}>
              历史{history.length > 0 ? ` (${history.length})` : ''}
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* ── Main split view ── */}
      <div ref={containerRef} className="json-split">
        {/* Left: Input */}
        <div
          className="input-panel"
          style={{ width: `${leftRatio * 100}%` }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="在此输入 JSON 数据，或拖放 JSON 文件..."
            style={{ flex: 1, resize: 'none', fontFamily: 'Consolas, monospace' }}
          />
          <div className="input-float-actions">
            <Tooltip title="复制输入内容">
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => { navigator.clipboard.writeText(input); message.success('已复制输入内容') }}
                disabled={!hasInput}
              />
            </Tooltip>
          </div>
        </div>

        <div className="split-handle" onMouseDown={onDragStart}>
          <div className="split-handle-line" />
        </div>

        {/* Right: Tree + Query + Stats */}
        <div className="tree-panel-wrapper" style={{ width: `${(1 - leftRatio) * 100}%` }}>
          {/* Stats bar */}
          {stats && (
            <div className="json-stats-bar">
              <span>{stats.fields} 字段</span>
              <span>深度 {stats.maxDepth}</span>
              <span>{stats.objects} 对象</span>
              <span>{stats.arrays} 数组</span>
              <span>{stats.strings} 字符串</span>
              <span>{stats.numbers} 数字</span>
              {stats.booleans > 0 && <span>{stats.booleans} 布尔</span>}
              {stats.nulls > 0 && <span>{stats.nulls} null</span>}
            </div>
          )}

          {/* JSONPath query */}
          {parsedData !== undefined && (
            <div className="json-query-bar">
              <SearchOutlined className="json-query-icon" />
              <Input
                size="small"
                value={queryPath}
                onChange={(e) => setQueryPath(e.target.value)}
                onPressEnter={handleQuery}
                placeholder="JSONPath 查询，如 data.users[0].name"
                style={{ flex: 1, fontFamily: 'Consolas, monospace' }}
                variant="borderless"
              />
              <Button size="small" type="link" onClick={handleQuery}>查询</Button>
            </div>
          )}

          {/* Query result */}
          {queryResult !== null && (
            <div className="json-query-result">
              <pre>{queryResult}</pre>
              <Tooltip title="复制结果">
                <CopyOutlined
                  className="json-query-copy"
                  onClick={() => { navigator.clipboard.writeText(queryResult); message.success('已复制') }}
                />
              </Tooltip>
            </div>
          )}

          {/* Tree */}
          <div className="tree-panel" style={{ overflow: 'auto' }} onClick={() => setContextMenu(null)}>
            {treeData.length > 0 ? (
              <Tree
                treeData={treeData}
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as string[])}
                selectable={false}
                showLine={{ showLeafIcon: false }}
                switcherIcon={(nodeProps: any) =>
                  nodeProps.isLeaf ? null : (
                    <span className="tree-switcher-triangle">
                      {nodeProps.expanded ? '▼' : '▶'}
                    </span>
                  )
                }
                className="modern-tree"
                onRightClick={({ event, node }) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextMenu({ x: event.clientX, y: event.clientY, node: node as unknown as JsonTreeNode })
                }}
                titleRender={(nodeData) => {
                  const n = nodeData as unknown as JsonTreeNode
                  const title = n.title
                  const colonIdx = title.indexOf(': ')
                  const bracketIdx = title.indexOf(' [')
                  const braceIdx = title.indexOf(' {')
                  const renameable = isKeyRenameable(n)

                  let keyLabel: string
                  let suffix: string
                  if (colonIdx !== -1 && n.isLeaf) {
                    keyLabel = title.substring(0, colonIdx)
                    suffix = ''
                  } else if (bracketIdx !== -1) {
                    keyLabel = title.substring(0, bracketIdx)
                    suffix = title.substring(bracketIdx)
                  } else if (braceIdx !== -1) {
                    keyLabel = title.substring(0, braceIdx)
                    suffix = title.substring(braceIdx)
                  } else {
                    keyLabel = title
                    suffix = ''
                  }
                  const valLabel = colonIdx !== -1 && n.isLeaf ? title.substring(colonIdx + 2) : ''

                  if (editingKeyNameKey === n.key) {
                    return (
                      <span className="json-tree-edit-row">
                        <input
                          className="json-tree-edit-input"
                          value={editKeyNameValue}
                          onChange={(e) => setEditKeyNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleKeyNameEditConfirm()
                            if (e.key === 'Escape') handleKeyNameEditCancel()
                          }}
                          onBlur={handleKeyNameEditConfirm}
                          autoFocus
                          spellCheck={false}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {n.isLeaf ? <span>: {valLabel}</span> : <span>{suffix}</span>}
                      </span>
                    )
                  }

                  if (editingKey === n.key && n.isLeaf) {
                    return (
                      <span className="json-tree-edit-row">
                        <span className="tree-label">{keyLabel}: </span>
                        <input
                          className="json-tree-edit-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTreeEditConfirm()
                            if (e.key === 'Escape') handleTreeEditCancel()
                          }}
                          onBlur={handleTreeEditConfirm}
                          autoFocus
                          spellCheck={false}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </span>
                    )
                  }

                  const keySpan = renameable ? (
                    <span
                      className="json-tree-key-editable"
                      onDoubleClick={(e) => { e.stopPropagation(); handleKeyNameDoubleClick(n) }}
                      title="双击编辑键名"
                    >
                      {keyLabel}
                    </span>
                  ) : (
                    <span>{keyLabel}</span>
                  )

                  if (n.isLeaf && colonIdx !== -1) {
                    return (
                      <span className="tree-label">
                        {keySpan}: <span
                          className="json-tree-value-editable"
                          onDoubleClick={(e) => { e.stopPropagation(); handleTreeDoubleClick(n) }}
                          title="双击编辑值"
                        >{valLabel}</span>
                      </span>
                    )
                  }

                  return <span className="tree-label">{keySpan}{suffix}</span>
                }}
              />
            ) : (
              <div className="tree-empty">
                <span>请输入 JSON 数据并点击格式化...</span>
              </div>
            )}
          </div>
          {contextMenu && (
            <div
              style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1050 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Menu
                items={buildJsonContextMenuItems(contextMenu.node)}
                onClick={() => setContextMenu(null)}
                style={{ borderRadius: 8, boxShadow: '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12)' }}
              />
            </div>
          )}

          {treeData.length > 0 && (
            <div className="input-float-actions active">
              <Tooltip title="折叠所有">
                <Button size="small" icon={<ShrinkOutlined />} onClick={() => setExpandedKeys([])} />
              </Tooltip>
              <Tooltip title="展开所有">
                <Button size="small" icon={<ArrowsAltOutlined />} onClick={() => setExpandedKeys(collectAllKeys(treeData))} />
              </Tooltip>
              <Tooltip title="复制格式化 JSON">
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopy} disabled={!formatted} />
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
