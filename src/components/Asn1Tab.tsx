import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Button, Input, Tree, Space, Cascader, Select, message, Spin, Tooltip, Menu, Dropdown,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  ThunderboltOutlined, ClearOutlined, CopyOutlined, AlignLeftOutlined,
  ShrinkOutlined, ArrowsAltOutlined, ReloadOutlined, SearchOutlined,
  SwapOutlined, DownloadOutlined, NodeIndexOutlined, FolderViewOutlined, DeleteOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { ASN1 } from '@lapo/asn1js'
import { Hex } from '@lapo/asn1js/hex.js'
import { Base64 } from '@lapo/asn1js/base64.js'
import { parseAsn1, getTypeTree, type TypeTreeModule } from '../services/java-rpc'
import { useJavaStatus } from '../hooks/useJavaStatus'

const { TextArea } = Input

interface Props {
  onStatusChange: (s: string) => void
  isActive?: boolean
}

interface AntTreeNode {
  title: string | React.ReactNode
  key: string
  children?: AntTreeNode[]
  rawName?: string
  rawValue?: string
}

interface CascaderOption {
  value: string
  label: string
  children?: CascaderOption[]
}

const MAX_HISTORY = 20
const MAX_PREVIEW_LEN = 80
const MAX_FULL_DATA_LEN = 10000

interface Asn1HistoryItem {
  data: string
  fullData: string
  module?: string
  version?: string
  type?: string
  encoding?: string
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

let nodeKeyCounter = 0

function objectPreview(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  const primitives = entries.filter(([, v]) => v !== null && typeof v !== 'object')
  if (primitives.length === 0) return ''
  const parts = primitives.slice(0, 3).map(([k, v]) => {
    const vs = typeof v === 'string' ? `"${v.length > 40 ? v.slice(0, 40) + '…' : v}"` : String(v)
    return `${k}: ${vs}`
  })
  return parts.join(', ') + (primitives.length > 3 ? ', …' : '')
}

function jsonToAntTree(json: any, name: string, prefix = ''): AntTreeNode {
  const key = `${prefix}-${nodeKeyCounter++}`

  if (json === null || json === undefined) {
    return {
      title: (
        <span className="tree-label">
          <span className="tree-name">{name}</span>
          <span className="tree-null">: null</span>
        </span>
      ),
      key,
      rawName: name,
      rawValue: 'null',
    }
  }

  if (Array.isArray(json)) {
    return {
      title: (
        <span className="tree-label">
          <span className="tree-name">{name}</span>
          <span className="tree-meta"> [{json.length}]</span>
        </span>
      ),
      key,
      rawName: name,
      children: json.map((item, i) => jsonToAntTree(item, `[${i}]`, key)),
    }
  }

  if (typeof json === 'object') {
    const entries = Object.entries(json)
    const preview = objectPreview(json as Record<string, unknown>)
    return {
      title: (
        <span className="tree-label">
          <span className="tree-name">{name}</span>
          <span className="tree-meta"> {'{' + entries.length + '}'}</span>
          {preview && <span className="tree-preview"> {preview}</span>}
        </span>
      ),
      key,
      rawName: name,
      rawValue: preview || undefined,
      children: entries.map(([k, v]) => jsonToAntTree(v, k, key)),
    }
  }

  const strValue = String(json)
  return {
    title: (
      <span className="tree-label">
        <span className="tree-name">{name}</span>
        <span className="tree-value">: {strValue}</span>
      </span>
    ),
    key,
    rawName: name,
    rawValue: strValue,
  }
}

function collectAllKeys(nodes: AntTreeNode[]): string[] {
  const keys: string[] = []
  for (const n of nodes) {
    keys.push(n.key)
    if (n.children) keys.push(...collectAllKeys(n.children))
  }
  return keys
}

function swapBytes(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  const result: string[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.substring(i, i + 4)
    if (chunk.length === 4) {
      result.push(chunk.substring(2, 4) + chunk.substring(0, 2))
    } else {
      result.push(chunk)
    }
  }
  return result.join('')
}

function updateNodeInTree(
  nodes: AntTreeNode[], key: string, updater: (n: AntTreeNode) => AntTreeNode,
): AntTreeNode[] {
  return nodes.map((n) => {
    if (n.key === key) return updater(n)
    if (n.children) return { ...n, children: updateNodeInTree(n.children, key, updater) }
    return n
  })
}

function decodeInput(input: string): ReturnType<typeof ASN1.decode> {
  const trimmed = input.trim().replace(/\s+/g, '')
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return ASN1.decode(Hex.decode(trimmed))
  }
  return ASN1.decode(Base64.decode(trimmed))
}

function splitTagLen(node: ReturnType<typeof ASN1.decode>): { tagHex: string; lenHex: string } {
  const fullHeader = node.toHexString().substring(0, node.header * 2).toUpperCase()
  const firstByte = parseInt(fullHeader.substring(0, 2), 16)
  let tagBytes = 1
  if ((firstByte & 0x1f) === 0x1f) {
    while (tagBytes < node.header) {
      const b = parseInt(fullHeader.substring(tagBytes * 2, tagBytes * 2 + 2), 16)
      tagBytes++
      if (!(b & 0x80)) break
    }
  }
  const tagHex = fullHeader.substring(0, tagBytes * 2)
  const lenHex = fullHeader.substring(tagBytes * 2)
  return { tagHex, lenHex }
}

interface TlvNode {
  tagHex: string
  typeName: string
  valueHex: string
  contentDesc: string
  children: TlvNode[]
}

interface TlvDisplayLine {
  indent: number
  tagHex: string
  lenHex: string
  typeName: string
  detail: string
  valueHex: string
  isLeaf: boolean
  path: number[]
}

function encodeBerLength(len: number): string {
  if (len < 0x80) return len.toString(16).padStart(2, '0').toUpperCase()
  let h = len.toString(16).toUpperCase()
  if (h.length % 2) h = '0' + h
  return (0x80 | (h.length / 2)).toString(16).toUpperCase().padStart(2, '0') + h
}

function nodeContentLength(node: TlvNode): number {
  if (node.children.length > 0) {
    return node.children.reduce((sum, child) => {
      const cl = nodeContentLength(child)
      return sum + child.tagHex.length / 2 + encodeBerLength(cl).length / 2 + cl
    }, 0)
  }
  return node.valueHex.length / 2
}

function buildTlvTree(asn1Node: ReturnType<typeof ASN1.decode>): TlvNode {
  const { tagHex } = splitTagLen(asn1Node)
  const typeName = asn1Node.typeName()

  if (asn1Node.sub !== null && asn1Node.sub.length > 0) {
    const contentStr = asn1Node.content() ?? ''
    const name = contentStr ? `${typeName} ${contentStr}` : typeName
    return {
      tagHex, typeName: name, valueHex: '', contentDesc: '',
      children: asn1Node.sub.map((child) => buildTlvTree(child)),
    }
  }

  let content = ''
  try { content = asn1Node.content() ?? '' } catch { /* ignore */ }
  const valueHex = asn1Node.toHexString().substring(asn1Node.header * 2).toUpperCase()
  return { tagHex, typeName, valueHex, contentDesc: content, children: [] }
}

function flattenTlvTree(node: TlvNode, indent = 0, path: number[] = []): TlvDisplayLine[] {
  const contentLen = nodeContentLength(node)
  const lenHex = encodeBerLength(contentLen)

  if (node.children.length > 0) {
    const line: TlvDisplayLine = {
      indent, tagHex: node.tagHex, lenHex, typeName: node.typeName,
      detail: `(${contentLen} byte${contentLen !== 1 ? 's' : ''})`,
      valueHex: '', isLeaf: false, path: [...path],
    }
    const childLines = node.children.flatMap((child, i) =>
      flattenTlvTree(child, indent + 1, [...path, i]),
    )
    return [line, ...childLines]
  }

  const displayVal = node.valueHex.length > 80
    ? node.valueHex.substring(0, 80) + '...'
    : node.valueHex
  return [{
    indent, tagHex: node.tagHex, lenHex, typeName: node.typeName,
    detail: node.contentDesc || displayVal,
    valueHex: node.valueHex, isLeaf: true, path: [...path],
  }]
}

function tlvTreeToHex(node: TlvNode): string {
  const contentLen = nodeContentLength(node)
  const lenHex = encodeBerLength(contentLen)
  if (node.children.length > 0) {
    return node.tagHex + lenHex + node.children.map(tlvTreeToHex).join('')
  }
  return node.tagHex + lenHex + node.valueHex
}

function updateTlvNodeValue(root: TlvNode, path: number[], newValueHex: string, newContentDesc: string): TlvNode {
  if (path.length === 0) {
    return { ...root, valueHex: newValueHex, contentDesc: newContentDesc }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    children: root.children.map((child, i) =>
      i === idx ? updateTlvNodeValue(child, rest, newValueHex, newContentDesc) : child,
    ),
  }
}

function updateTlvNodeTag(root: TlvNode, path: number[], newTagHex: string): TlvNode {
  if (path.length === 0) {
    return { ...root, tagHex: newTagHex }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    children: root.children.map((child, i) =>
      i === idx ? updateTlvNodeTag(child, rest, newTagHex) : child,
    ),
  }
}

function deleteTlvNode(root: TlvNode, path: number[]): TlvNode | null {
  if (path.length === 1) {
    const newChildren = root.children.filter((_, i) => i !== path[0])
    if (root.children.length > 0 && newChildren.length === 0) return null
    return { ...root, children: newChildren }
  }
  const [idx, ...rest] = path
  return {
    ...root,
    children: root.children.map((child, i) =>
      i === idx ? deleteTlvNode(child, rest) : child,
    ).filter((c): c is TlvNode => c !== null),
  }
}

function pathEquals(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function integerToHex(str: string): string | null {
  const trimmed = str.trim().replace(/[()]/g, '').trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  let num: bigint
  try { num = BigInt(trimmed) } catch { return null }
  if (num === 0n) return '00'
  const negative = num < 0n
  let abs = negative ? -num : num
  const bytes: number[] = []
  while (abs > 0n) {
    bytes.unshift(Number(abs & 0xFFn))
    abs >>= 8n
  }
  if (negative) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (~bytes[i]) & 0xFF
    let carry = 1
    for (let i = bytes.length - 1; i >= 0 && carry; i--) {
      const sum = bytes[i] + carry
      bytes[i] = sum & 0xFF
      carry = sum >> 8
    }
    if (carry) bytes.unshift(0xFF)
    if (!(bytes[0] & 0x80)) bytes.unshift(0xFF)
  } else {
    if (bytes[0] & 0x80) bytes.unshift(0x00)
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function oidToHex(oidStr: string): string | null {
  const dotted = oidStr.trim().split(/[\s\n]/)[0]
  const parts = dotted.split('.')
  if (parts.length < 2) return null
  const nums: bigint[] = []
  for (const s of parts) {
    try { nums.push(BigInt(s)) } catch { return null }
  }
  if (nums.some(n => n < 0n)) return null
  const first = Number(nums[0])
  const second = Number(nums[1])
  if (first > 2 || (first < 2 && second > 39)) return null
  const bytes: number[] = [first * 40 + second]
  for (let i = 2; i < nums.length; i++) {
    let val = nums[i]
    const encoded: number[] = []
    encoded.unshift(Number(val & 0x7Fn))
    val >>= 7n
    while (val > 0n) {
      encoded.unshift(Number((val & 0x7Fn) | 0x80n))
      val >>= 7n
    }
    bytes.push(...encoded)
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function booleanToHex(str: string): string | null {
  const s = str.trim().toLowerCase()
  if (s === 'true' || s === 'ff') return 'FF'
  if (s === 'false' || s === '00' || s === '0') return '00'
  return null
}

function normalizeTypeName(typeName: string): string {
  return typeName.toUpperCase().replace(/[_\s]+/g, '')
}

function canEncodeDisplayType(typeName: string): boolean {
  const u = normalizeTypeName(typeName)
  return (
    u.includes('INTEGER') || u.includes('ENUMERATED') ||
    u.includes('BOOLEAN') ||
    (u.includes('OBJECT') && u.includes('IDENTIFIER')) ||
    u.includes('UTF8') || u.includes('PRINTABLE') || u.includes('IA5') ||
    u.includes('VISIBLE') || u.includes('TELETEX') || u.includes('T61') ||
    u.includes('NUMERIC') || u.includes('GENERALSTRING') ||
    u.includes('GENERALIZEDTIME') || u.includes('UTCTIME') ||
    u.includes('BMP')
  )
}

function encodeDisplayToHex(typeName: string, displayValue: string): string | null {
  const upper = normalizeTypeName(typeName)
  if (upper.includes('INTEGER') || upper.includes('ENUMERATED')) return integerToHex(displayValue)
  if (upper.includes('BOOLEAN')) return booleanToHex(displayValue)
  if (upper.includes('OBJECT') && upper.includes('IDENTIFIER')) return oidToHex(displayValue)
  if (upper.includes('UTF8') || upper.includes('PRINTABLE') || upper.includes('IA5') ||
      upper.includes('VISIBLE') || upper.includes('TELETEX') || upper.includes('T61') ||
      upper.includes('NUMERIC') || upper.includes('GENERALSTRING') ||
      upper.includes('GENERALIZEDTIME') || upper.includes('UTCTIME')) {
    return textToHex(displayValue)
  }
  if (upper.includes('BMP')) {
    const bytes: number[] = []
    for (let i = 0; i < displayValue.length; i++) {
      const code = displayValue.charCodeAt(i)
      bytes.push((code >> 8) & 0xFF, code & 0xFF)
    }
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return null
}

function searchTree(nodes: AntTreeNode[], query: string): { matched: Set<string>; expanded: string[] } {
  const matched = new Set<string>()
  const expandSet = new Set<string>()
  const q = query.toLowerCase()
  function walk(items: AntTreeNode[], ancestors: string[]): boolean {
    let found = false
    for (const node of items) {
      const nameMatch = node.rawName?.toLowerCase().includes(q) ?? false
      const valMatch = node.rawValue?.toLowerCase().includes(q) ?? false
      let childMatch = false
      if (node.children) childMatch = walk(node.children, [...ancestors, node.key])
      if (nameMatch || valMatch) { matched.add(node.key); found = true }
      if (nameMatch || valMatch || childMatch) {
        for (const a of ancestors) expandSet.add(a)
        expandSet.add(node.key)
        found = true
      }
    }
    return found
  }
  walk(nodes, [])
  return { matched, expanded: [...expandSet] }
}

function computeTreeStats(nodes: AntTreeNode[]): { nodeCount: number; maxDepth: number } {
  let count = 0; let maxDepth = 0
  function walk(items: AntTreeNode[], depth: number) {
    for (const n of items) {
      count++
      if (depth > maxDepth) maxDepth = depth
      if (n.children) walk(n.children, depth + 1)
    }
  }
  walk(nodes, 1)
  return { nodeCount: count, maxDepth }
}

function getNodePath(nodes: AntTreeNode[], targetKey: string, path: string[] = []): string[] | null {
  for (const n of nodes) {
    const current = [...path, n.rawName || '']
    if (n.key === targetKey) return current
    if (n.children) {
      const found = getNodePath(n.children, targetKey, current)
      if (found) return found
    }
  }
  return null
}

function getAncestorKeys(nodes: AntTreeNode[], targetKey: string, ancestors: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.key === targetKey) return ancestors
    if (n.children) {
      const found = getAncestorKeys(n.children, targetKey, [...ancestors, n.key])
      if (found) return found
    }
  }
  return null
}

function treeNodeToJson(node: AntTreeNode): unknown {
  if (!node.children || node.children.length === 0) return node.rawValue ?? null
  if (node.children.some(c => c.rawName?.startsWith('['))) {
    return node.children.map(c => treeNodeToJson(c))
  }
  const obj: Record<string, unknown> = {}
  for (const child of node.children) obj[child.rawName || ''] = treeNodeToJson(child)
  return obj
}

function hexToBase64(hex: string): string {
  const clean = hex.replace(/\s+/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  return btoa(String.fromCharCode(...bytes))
}

function base64ToHex(b64: string): string {
  return Array.from(atob(b64.trim())).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function computeByteCount(input: string): number {
  const trimmed = input.trim().replace(/\s+/g, '')
  if (!trimmed) return 0
  if (/^[0-9a-fA-F]+$/.test(trimmed)) return Math.floor(trimmed.length / 2)
  try { return atob(trimmed).length } catch { return 0 }
}

function computeTlvLineOffsets(root: TlvNode): number[] {
  const offsets: number[] = []
  function walk(node: TlvNode, pos: number): number {
    const contentLen = nodeContentLength(node)
    const lenBytes = encodeBerLength(contentLen).length / 2
    const tagBytes = node.tagHex.length / 2
    offsets.push(pos)
    const headerEnd = pos + tagBytes + lenBytes
    if (node.children.length > 0) {
      let childPos = headerEnd
      for (const child of node.children) childPos = walk(child, childPos)
      return childPos
    }
    return headerEnd + node.valueHex.length / 2
  }
  walk(root, 0)
  return offsets
}

const EXAMPLE_DATA: { label: string; hex: string }[] = [
  {
    label: 'SEQUENCE (INT + UTF8)',
    hex: '300D02030186A00C06E6B58BE8AF95',
  },
  {
    label: 'BOOL + OID + NULL',
    hex: '300F0101FF06082A8648CE3D0301070500',
  },
]

function buildCascaderOptions(typeTree: TypeTreeModule[]): CascaderOption[] {
  return typeTree.map((m) => ({
    value: m.module,
    label: m.module,
    children: m.versions.map((v) => ({
      value: v.version,
      label: `v${v.version}`,
      children: v.types.map((t) => ({
        value: t,
        label: t,
      })),
    })),
  }))
}

export default function Asn1Tab({ onStatusChange, isActive }: Props) {
  const [typeTree, setTypeTree] = useState<TypeTreeModule[]>([])
  const [cascaderValue, setCascaderValue] = useState<string[]>([])
  const [encoding, setEncoding] = useState('auto')
  const [inputData, setInputData] = useState('')
  const [treeData, setTreeData] = useState<AntTreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [resultJson, setResultJson] = useState<any>(null)
  const javaStatus = useJavaStatus((s) => s.status)

  const [rawData, setRawData] = useState('')
  const [tlvFormatted, setTlvFormatted] = useState(false)
  const [tlvRoot, setTlvRoot] = useState<TlvNode | null>(null)
  const [tlvModified, setTlvModified] = useState(false)
  const [editingPath, setEditingPath] = useState<number[] | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editIsHex, setEditIsHex] = useState(false)
  const [editingTagPath, setEditingTagPath] = useState<number[] | null>(null)
  const [editTagValue, setEditTagValue] = useState('')
  const [selectedTlvIndex, setSelectedTlvIndex] = useState<number | null>(null)
  const [selectedTreeKey, setSelectedTreeKey] = useState<string | null>(null)
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set())
  const editInputRef = useRef<HTMLInputElement>(null)
  const editTagInputRef = useRef<HTMLInputElement>(null)

  const [history, setHistory] = useState<Asn1HistoryItem[]>([])

  const tlvDisplayLines = useMemo(() => {
    if (!tlvRoot) return []
    return flattenTlvTree(tlvRoot)
  }, [tlvRoot])

  const [searchText, setSearchText] = useState('')
  const matchedKeys = useMemo(() => {
    if (!searchText.trim() || treeData.length === 0) return new Set<string>()
    return searchTree(treeData, searchText.trim()).matched
  }, [treeData, searchText])

  const treeStats = useMemo(() => {
    if (treeData.length === 0) return null
    return computeTreeStats(treeData)
  }, [treeData])

  const tlvOffsets = useMemo(() => {
    if (!tlvRoot) return []
    return computeTlvLineOffsets(tlvRoot)
  }, [tlvRoot])

  const byteCount = useMemo(() => {
    const data = (tlvFormatted && rawData) ? rawData : inputData
    return computeByteCount(data)
  }, [inputData, rawData, tlvFormatted])

  const lastClickRef = useRef<{ key: string; time: number }>({ key: '', time: 0 })

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: AntTreeNode } | null>(null)
  const [leftRatio, setLeftRatio] = useState(0.5)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  useEffect(() => {
    if (javaStatus === 'running') {
      getTypeTree()
        .then(setTypeTree)
        .catch((err) => console.error('Failed to load type tree:', err))
    }
  }, [javaStatus])

  useEffect(() => {
    if (isActive === false) return
    const handler = (e: Event) => {
      const { tab, content } = (e as CustomEvent).detail
      if (tab === 'asn1' && content) {
        setInputData(content)
        onStatusChange('已从悬浮按钮接收剪贴板内容')
      }
    }
    window.addEventListener('float-clipboard-input', handler)
    return () => window.removeEventListener('float-clipboard-input', handler)
  }, [onStatusChange, isActive])

  useEffect(() => {
    window.electronAPI?.getConfig('asn1History').then((val) => {
      if (Array.isArray(val)) setHistory(val)
    })
  }, [])

  const [refreshing, setRefreshing] = useState(false)

  const handleRefreshTypes = async () => {
    setRefreshing(true)
    try {
      const tree = await getTypeTree()
      setTypeTree(tree)
      message.success('类型列表已刷新')
    } catch (err) {
      console.error('Failed to refresh type tree:', err)
      message.error('刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  const cascaderOptions = buildCascaderOptions(typeTree)

  const selectedModule = cascaderValue[0]
  const selectedVersion = cascaderValue[1]
  const selectedType = cascaderValue[2]

  const handleParse = async () => {
    if (!selectedType) {
      message.warning('请选择 ASN.1 数据类型')
      return
    }
    const dataToSend = (tlvFormatted && rawData) ? rawData : inputData.trim()
    if (!dataToSend) {
      message.warning('请输入要解析的数据')
      return
    }

    setLoading(true)
    try {
      nodeKeyCounter = 0
      const result = await parseAsn1({
        module: selectedModule,
        version: selectedVersion,
        type: selectedType,
        encoding,
        data: dataToSend,
      })
      setResultJson(result.json)
      const rootNode = jsonToAntTree(result.json, selectedType, 'root')
      setTreeData([rootNode])
      setExpandedKeys([rootNode.key])
      onStatusChange(`解析成功 - ${result.encoding === 'base64' ? 'Base64' : 'HEX'} 编码`)
      const preview = dataToSend.length > MAX_PREVIEW_LEN ? dataToSend.slice(0, MAX_PREVIEW_LEN) + '…' : dataToSend
      const fullData = dataToSend.length > MAX_FULL_DATA_LEN ? dataToSend.slice(0, MAX_FULL_DATA_LEN) : dataToSend
      const historyItem: Asn1HistoryItem = {
        data: preview, fullData,
        module: selectedModule, version: selectedVersion, type: selectedType,
        encoding, time: Date.now(),
      }
      setHistory((prev) => {
        if (prev.length > 0 && prev[0].fullData === fullData) return prev
        const next = [historyItem, ...prev].slice(0, MAX_HISTORY)
        window.electronAPI?.setConfig('asn1History', next)
        return next
      })
    } catch (err: any) {
      message.error(err.message || '解析失败')
      onStatusChange('解析失败: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setInputData('')
    setRawData('')
    setTlvFormatted(false)
    setTlvRoot(null)
    setTlvModified(false)
    setEditingPath(null)
    setTreeData([])
    setResultJson(null)
    onStatusChange('已清空')
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => {
          const text = reader.result as string
          setInputData(text)
          onStatusChange(`已加载文件: ${file.name}`)
        }
        reader.readAsText(file)
      }
    },
    [onStatusChange],
  )

  const buildContextMenuItems = (node: AntTreeNode): MenuProps['items'] => {
    const items: MenuProps['items'] = []
    const val = node.rawValue || ''
    if (val) {
      items.push({
        key: 'copyValue',
        label: '复制值',
        onClick: () => {
          navigator.clipboard.writeText(val)
          message.success('已复制')
          setContextMenu(null)
        },
      })
      items.push({
        key: 'copyHex',
        label: '复制十六进制',
        onClick: () => {
          const hex = Array.from(new TextEncoder().encode(val))
            .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
          navigator.clipboard.writeText(hex)
          message.success('已复制十六进制')
          setContextMenu(null)
        },
      })
      const cleanVal = val.replace(/\s+/g, '')
      if (cleanVal.length >= 4 && cleanVal.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(cleanVal)) {
        items.push(
          { type: 'divider' },
          {
            key: 'swapBytes',
            label: '高低位转换',
            onClick: () => {
              const swapped = swapBytes(cleanVal)
              setTreeData((prev) => updateNodeInTree(prev, node.key, (n) => ({
                ...n,
                rawValue: swapped,
                title: (
                  <span className="tree-label">
                    <span className="tree-name">{n.rawName || ''}</span>
                    <span className="tree-value">: {swapped}</span>
                  </span>
                ),
              })))
              setContextMenu(null)
            },
          },
        )
      }
    }
    const nodePath = getNodePath(treeData, node.key)
    if (nodePath) {
      items.push(
        { type: 'divider' },
        {
          key: 'copyPath',
          label: '复制路径',
          icon: <NodeIndexOutlined />,
          onClick: () => {
            navigator.clipboard.writeText(nodePath.join(' > '))
            message.success('已复制路径')
            setContextMenu(null)
          },
        },
      )
    }
    if (node.children && node.children.length > 0) {
      items.push({
        key: 'copySubtreeJson',
        label: '复制子树 JSON',
        icon: <CopyOutlined />,
        onClick: () => {
          navigator.clipboard.writeText(JSON.stringify(treeNodeToJson(node), null, 2))
          message.success('已复制子树 JSON')
          setContextMenu(null)
        },
      })
      items.push({
        key: 'focusSubtree',
        label: '展开子树',
        icon: <FolderViewOutlined />,
        onClick: () => {
          const ancestors = getAncestorKeys(treeData, node.key) || []
          setExpandedKeys([...ancestors, ...collectAllKeys([node])])
          setContextMenu(null)
        },
      })
    }
    return items
  }

  const handleSearch = useCallback((value: string) => {
    setSearchText(value)
    if (!value.trim() || treeData.length === 0) return
    const { expanded } = searchTree(treeData, value.trim())
    if (expanded.length > 0) setExpandedKeys(expanded)
  }, [treeData])

  const handleConvertFormat = () => {
    const current = inputData.trim()
    if (!current) return
    const clean = current.replace(/\s+/g, '')
    try {
      if (/^[0-9a-fA-F]+$/.test(clean)) {
        setInputData(hexToBase64(clean))
        message.success('已转换为 Base64')
      } else {
        setInputData(base64ToHex(current))
        message.success('已转换为 HEX')
      }
    } catch {
      message.error('格式转换失败，请检查数据')
    }
  }

  const handleExport = async () => {
    const data = (tlvFormatted && rawData) ? rawData : inputData.trim()
    if (!data) { message.warning('没有数据可导出'); return }
    try {
      const clean = data.replace(/\s+/g, '')
      let bytes: number[]
      if (/^[0-9a-fA-F]+$/.test(clean)) {
        bytes = []
        for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substring(i, i + 2), 16))
      } else {
        bytes = Array.from(atob(clean)).map(c => c.charCodeAt(0))
      }
      const saved = await window.electronAPI?.saveFile(bytes, 'output.der')
      if (saved) message.success('已导出')
    } catch (e: any) {
      message.error('导出失败: ' + (e.message || ''))
    }
  }

  const cascaderFilter = (inputValue: string, path: CascaderOption[]) =>
    path.some((option) =>
      (option.label as string).toLowerCase().includes(inputValue.toLowerCase()),
    )

  const handleFormatTlv = () => {
    if (tlvFormatted && rawData) {
      setInputData(rawData)
      setTlvFormatted(false)
      setTlvRoot(null)
      setTlvModified(false)
      setEditingPath(null)
      onStatusChange('已恢复原始数据')
      return
    }
    const current = inputData.trim()
    if (!current) { message.warning('请先输入数据'); return }
    try {
      const asn1 = decodeInput(current)
      const root = buildTlvTree(asn1)
      setRawData(current)
      setTlvFormatted(true)
      setTlvRoot(root)
      setTlvModified(false)
      onStatusChange('已转换为 TLV 格式')
    } catch (e: any) {
      message.error('TLV 格式化失败: ' + (e.message || '请检查数据'))
    }
  }

  const toggleTlvCollapse = (path: number[]) => {
    const key = path.join(',')
    setCollapsedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isTlvLineHidden = (path: number[]): boolean => {
    for (let len = 0; len < path.length; len++) {
      if (collapsedPaths.has(path.slice(0, len).join(','))) return true
    }
    return false
  }

  const handleTlvDoubleClick = (line: TlvDisplayLine) => {
    if (!line.isLeaf || !tlvRoot) return
    setEditingPath(line.path)
    let node: TlvNode = tlvRoot
    for (const idx of line.path) node = node.children[idx]
    if (node.contentDesc && canEncodeDisplayType(node.typeName)) {
      setEditValue(node.contentDesc)
      setEditIsHex(false)
    } else {
      setEditValue(node.valueHex)
      setEditIsHex(true)
    }
  }

  const handleEditConfirm = () => {
    if (editingPath === null || !tlvRoot) { setEditingPath(null); return }

    let node: TlvNode = tlvRoot
    for (const idx of editingPath) node = node.children[idx]

    let newHex: string
    let newContentDesc: string

    if (editIsHex) {
      const cleaned = editValue.replace(/\s+/g, '').toUpperCase()
      if (!/^([0-9A-F]{2})*$/.test(cleaned)) {
        message.warning('HEX 值无效，已恢复')
        setEditingPath(null)
        setEditValue('')
        return
      }
      newHex = cleaned
      newContentDesc = ''
    } else {
      const encoded = encodeDisplayToHex(node.typeName, editValue)
      if (encoded === null) {
        message.warning('值格式无效，请检查输入')
        return
      }
      newHex = encoded
      newContentDesc = editValue
    }

    if (node.valueHex === newHex) {
      setEditingPath(null)
      setEditValue('')
      return
    }
    const updatedRoot = updateTlvNodeValue(tlvRoot, editingPath, newHex, newContentDesc)
    const rebuiltHex = tlvTreeToHex(updatedRoot)
    try {
      const asn1 = decodeInput(rebuiltHex)
      setTlvRoot(buildTlvTree(asn1))
    } catch {
      setTlvRoot(updatedRoot)
    }
    setTlvModified(true)
    setRawData(rebuiltHex)
    setEditingPath(null)
    setEditValue('')
    onStatusChange('已修改 TLV 值，长度已自动重算')
  }

  const handleEditCancel = () => {
    setEditingPath(null)
    setEditValue('')
  }

  const handleTagDoubleClick = (line: TlvDisplayLine) => {
    if (!tlvRoot) return
    setEditingTagPath(line.path)
    setEditTagValue(line.tagHex)
  }

  const handleTagEditConfirm = () => {
    if (editingTagPath === null || !tlvRoot) { setEditingTagPath(null); return }
    const cleaned = editTagValue.replace(/\s+/g, '').toUpperCase()
    if (!/^[0-9A-F]{2,}$/.test(cleaned)) {
      message.warning('Tag HEX 无效，已恢复')
      setEditingTagPath(null)
      setEditTagValue('')
      return
    }
    let node: TlvNode = tlvRoot
    for (const idx of editingTagPath) node = node.children[idx]
    if (node.tagHex === cleaned) {
      setEditingTagPath(null)
      setEditTagValue('')
      return
    }
    const updatedRoot = updateTlvNodeTag(tlvRoot, editingTagPath, cleaned)
    const rebuiltHex = tlvTreeToHex(updatedRoot)
    try {
      const asn1 = decodeInput(rebuiltHex)
      setTlvRoot(buildTlvTree(asn1))
    } catch {
      setTlvRoot(updatedRoot)
    }
    setTlvModified(true)
    setRawData(rebuiltHex)
    setEditingTagPath(null)
    setEditTagValue('')
    onStatusChange('已修改 Tag')
  }

  const handleTagEditCancel = () => {
    setEditingTagPath(null)
    setEditTagValue('')
  }

  const handleTlvDelete = (path: number[]) => {
    if (!tlvRoot) return
    if (path.length === 0) {
      setTlvFormatted(false)
      setRawData('')
      setTlvRoot(null)
      setTlvModified(false)
      onStatusChange('已清空 TLV')
      return
    }
    const updatedRoot = deleteTlvNode(tlvRoot, path)
    if (!updatedRoot) {
      setTlvFormatted(false)
      setRawData('')
      setTlvRoot(null)
      setTlvModified(false)
      onStatusChange('已清空 TLV')
      return
    }
    const rebuiltHex = tlvTreeToHex(updatedRoot)
    try {
      const asn1 = decodeInput(rebuiltHex)
      setTlvRoot(buildTlvTree(asn1))
    } catch {
      setTlvRoot(updatedRoot)
    }
    setTlvModified(true)
    setRawData(rebuiltHex)
    setEditingPath(null)
    setEditValue('')
    setSelectedTlvIndex(null)
    onStatusChange('已删除节点，长度已自动重算')
  }

  const handleHistoryRestore = (item: Asn1HistoryItem) => {
    setInputData(item.fullData)
    if (item.module && item.version && item.type) {
      setCascaderValue([item.module, item.version, item.type])
    }
    if (item.encoding) setEncoding(item.encoding)
    if (tlvFormatted) {
      setTlvFormatted(false)
      setRawData('')
      setTlvRoot(null)
      setTlvModified(false)
    }
    onStatusChange('已从历史恢复')
  }

  const handleDeleteHistoryItem = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory((prev) => {
      const next = prev.filter((_, i) => i !== index)
      window.electronAPI?.setConfig('asn1History', next)
      return next
    })
  }

  const handleClearHistory = () => {
    setHistory([])
    window.electronAPI?.setConfig('asn1History', [])
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
              {item.type && <span className="parse-history-item-type">{item.type}</span>}
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

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const ratio = Math.max(0.2, Math.min(0.8, x / rect.width))
      setLeftRatio(ratio)
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space wrap style={{ marginBottom: 8, marginTop: 8 }}>
        <Cascader
          options={cascaderOptions}
          value={cascaderValue}
          onChange={(val) => setCascaderValue((val as string[]) || [])}
          placeholder="模块 / 版本 / 类型"
          showSearch={{ filter: cascaderFilter }}
          allowClear
          expandTrigger="hover"
          style={{ minWidth: 420 }}
          displayRender={(labels) => labels.join(' / ')}
        />
        <Tooltip title="刷新类型列表">
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefreshTypes}
            loading={refreshing}
            disabled={javaStatus !== 'running'}
          />
        </Tooltip>
        <Select
          value={encoding}
          onChange={setEncoding}
          style={{ width: 100 }}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'hex', label: 'HEX' },
            { value: 'base64', label: 'Base64' },
          ]}
        />
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleParse}
          loading={loading}
          disabled={javaStatus !== 'running'}
        >
          解析
        </Button>
        <Button icon={<ClearOutlined />} onClick={handleClear}>
          清空
        </Button>
        <Select
          placeholder="加载示例…"
          style={{ width: 180 }}
          allowClear
          value={null as any}
          onChange={(val: string) => {
            if (val) {
              const example = EXAMPLE_DATA.find(e => e.hex === val)
              if (example) {
                setInputData(example.hex)
                if (tlvFormatted) {
                  setTlvFormatted(false)
                  setRawData('')
                  setTlvRoot(null)
                  setTlvModified(false)
                }
                onStatusChange(`已加载示例: ${example.label}`)
              }
            }
          }}
          options={EXAMPLE_DATA.map(e => ({ value: e.hex, label: e.label }))}
        />
        <Dropdown
          menu={{ items: historyMenuItems, style: { maxHeight: 420, overflowY: 'auto' } }}
          trigger={['click']}
          disabled={history.length === 0}
        >
          <Button icon={<HistoryOutlined />} disabled={history.length === 0}>
            历史{history.length > 0 ? ` (${history.length})` : ''}
          </Button>
        </Dropdown>
      </Space>

      <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Input */}
        <div
          className="input-panel"
          style={{ width: `${leftRatio * 100}%` }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {tlvFormatted && tlvRoot ? (
            <div className="tlv-view">
              <div className="tlv-view-inner">
                {tlvDisplayLines.map((line, i) => {
                  if (isTlvLineHidden(line.path)) return null
                  const isEditing = editingPath !== null && pathEquals(line.path, editingPath)
                  const isEditingTag = editingTagPath !== null && pathEquals(line.path, editingTagPath)
                  const offset = tlvOffsets[i] ?? 0
                  const isCollapsed = collapsedPaths.has(line.path.join(','))
                  return (
                    <div key={i} className={`tlv-line${selectedTlvIndex === i ? ' tlv-line-selected' : ''}`} style={{ paddingLeft: line.indent * 14 + 48 }} onClick={() => setSelectedTlvIndex(i)}>
                      <span className="tlv-offset" style={{ left: 0, position: 'absolute' }}>
                        {String(i + 1).padStart(3)}{' '}<span className="tlv-offset-hex">{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                      </span>
                      {!line.isLeaf ? (
                        <span
                          className={`tlv-toggle${isCollapsed ? ' collapsed' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleTlvCollapse(line.path) }}
                        >
                          {isCollapsed ? '▶' : '▼'}
                        </span>
                      ) : (
                        <span className="tlv-toggle-spacer" />
                      )}
                      {isEditingTag ? (
                        <input
                          ref={editTagInputRef}
                          className="tlv-edit-input tlv-edit-tag-input"
                          value={editTagValue}
                          onChange={(e) => setEditTagValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTagEditConfirm()
                            if (e.key === 'Escape') handleTagEditCancel()
                          }}
                          onBlur={handleTagEditConfirm}
                          autoFocus
                          spellCheck={false}
                        />
                      ) : (
                        <span
                          className="tlv-tag tlv-tag-editable"
                          onDoubleClick={(e) => { e.stopPropagation(); handleTagDoubleClick(line) }}
                          title="双击编辑 Tag"
                        >
                          {line.tagHex}
                        </span>
                      )}{' '}
                      <span className={`tlv-len${tlvModified ? ' tlv-len-auto' : ''}`}>{line.lenHex}</span>{' '}
                      <span className="tlv-type">{line.typeName}</span>{' '}
                      {isEditing ? (
                        <>
                          <input
                            ref={editInputRef}
                            className="tlv-edit-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditConfirm()
                              if (e.key === 'Escape') handleEditCancel()
                            }}
                            onBlur={handleEditConfirm}
                            autoFocus
                            spellCheck={false}
                          />
                          <span
                            className={`tlv-edit-badge${editIsHex ? ' is-hex' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              if (!editIsHex && tlvRoot && editingPath) {
                                let node: TlvNode = tlvRoot
                                for (const idx of editingPath) node = node.children[idx]
                                setEditValue(node.valueHex)
                                setEditIsHex(true)
                              } else if (editIsHex && tlvRoot && editingPath) {
                                let node: TlvNode = tlvRoot
                                for (const idx of editingPath) node = node.children[idx]
                                if (node.contentDesc && canEncodeDisplayType(node.typeName)) {
                                  setEditValue(node.contentDesc)
                                  setEditIsHex(false)
                                }
                              }
                            }}
                            title={editIsHex ? '当前编辑 HEX，点击切换为原始值' : '当前编辑原始值，点击切换为 HEX'}
                          >
                            {editIsHex ? 'HEX' : line.typeName}
                          </span>
                        </>
                      ) : (
                        <span
                          className={`tlv-detail${line.isLeaf ? ' tlv-editable' : ''}`}
                          onDoubleClick={() => handleTlvDoubleClick(line)}
                          title={line.isLeaf ? '双击编辑值' : undefined}
                        >
                          {line.detail}
                        </span>
                      )}
                      <span
                        className="tlv-delete-btn"
                        title="删除此节点"
                        onClick={(e) => { e.stopPropagation(); handleTlvDelete(line.path) }}
                      >
                        <DeleteOutlined />
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <TextArea
              value={inputData}
              onChange={(e) => {
                setInputData(e.target.value)
                if (tlvFormatted) {
                  setTlvFormatted(false)
                  setRawData('')
                  setTlvRoot(null)
                  setTlvModified(false)
                }
              }}
              placeholder="在此输入 HEX 或 Base64 数据，或拖放文件..."
              style={{ flex: 1, resize: 'none', fontFamily: 'Consolas, monospace' }}
            />
          )}
          {tlvFormatted && tlvRoot && (
            <div className="tlv-copy-float">
              {tlvModified && <span className="tlv-modified-badge">已修改</span>}
              <Tooltip title="复制 HEX">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(tlvTreeToHex(tlvRoot))
                    message.success('已复制 HEX')
                  }}
                />
              </Tooltip>
              <Tooltip title="导出为二进制文件 (.der)">
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExport} />
              </Tooltip>
            </div>
          )}
          {!tlvFormatted && inputData.trim() && (
            <div className="input-float-actions-top active">
              <Tooltip title="复制数据">
                <Button size="small" icon={<CopyOutlined />} onClick={() => {
                  navigator.clipboard.writeText(inputData.trim())
                  message.success('已复制')
                }} />
              </Tooltip>
              <Tooltip title="HEX ↔ Base64 互转">
                <Button size="small" icon={<SwapOutlined />} onClick={handleConvertFormat} />
              </Tooltip>
              <Tooltip title="导出为二进制文件 (.der)">
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExport} />
              </Tooltip>
            </div>
          )}
          {byteCount > 0 && (
            <div className="asn1-byte-count">{byteCount} bytes</div>
          )}
          <div className={`input-float-actions${tlvFormatted ? ' active' : ''}`}>
            {tlvFormatted && (
              <>
                <Tooltip title="折叠所有">
                  <Button
                    size="small"
                    icon={<ShrinkOutlined />}
                    onClick={() => {
                      const allPaths = new Set(
                        tlvDisplayLines
                          .filter((l) => !l.isLeaf)
                          .map((l) => l.path.join(','))
                      )
                      setCollapsedPaths(allPaths)
                    }}
                  />
                </Tooltip>
                <Tooltip title="展开所有">
                  <Button
                    size="small"
                    icon={<ArrowsAltOutlined />}
                    onClick={() => setCollapsedPaths(new Set())}
                  />
                </Tooltip>
              </>
            )}
            <Tooltip title={tlvFormatted ? '恢复原始数据' : '转为 HEX 并按 TLV 格式化'}>
              <Button
                size="small"
                type={tlvFormatted ? 'primary' : 'default'}
                icon={<AlignLeftOutlined />}
                onClick={handleFormatTlv}
                disabled={!tlvFormatted && !inputData.trim()}
              >
                TLV
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Drag Handle */}
        <div
          className="split-handle"
          onMouseDown={onDragStart}
        >
          <div className="split-handle-line" />
        </div>

        {/* Right: Tree */}
        <div
          className="tree-panel-wrapper"
          style={{ width: `${(1 - leftRatio) * 100}%` }}
        >
          {treeData.length > 0 && (
            <div className="asn1-tree-toolbar">
              <Input
                size="small"
                placeholder="搜索字段名、值、OID…"
                prefix={<SearchOutlined style={{ color: '#aaa' }} />}
                allowClear
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              {treeStats && (
                <div className="asn1-stats-bar">
                  <span>{treeStats.nodeCount} 节点</span>
                  <span>深度 {treeStats.maxDepth}</span>
                  <span>{byteCount} B</span>
                </div>
              )}
            </div>
          )}
          <div className="tree-panel">
            <Spin spinning={loading}>
              {treeData.length > 0 ? (
                <Tree
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys as string[])}
                  filterTreeNode={(node) => matchedKeys.has(node.key as string)}
                  onRightClick={({ event, node }) => {
                    const n = node as unknown as AntTreeNode
                    const menuItems = buildContextMenuItems(n)
                    const hasReal = menuItems?.some((item) => item && (item as any).type !== 'divider')
                    if (!hasReal) return
                    event.preventDefault()
                    event.stopPropagation()
                    setContextMenu({ x: event.clientX, y: event.clientY, node: n })
                  }}
                  selectedKeys={selectedTreeKey ? [selectedTreeKey] : []}
                  onSelect={(_keys, { node }) => {
                    const k = node.key as string
                    const now = Date.now()
                    const n = node as unknown as AntTreeNode
                    setSelectedTreeKey(k)
                    if (lastClickRef.current.key === k && now - lastClickRef.current.time < 400 && n.rawValue && !n.children?.length) {
                      navigator.clipboard.writeText(n.rawValue)
                      message.success('已复制值')
                      lastClickRef.current = { key: '', time: 0 }
                      return
                    }
                    lastClickRef.current = { key: k, time: now }
                    setExpandedKeys((prev) =>
                      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                    )
                  }}
                  showLine={{ showLeafIcon: false }}
                  switcherIcon={(nodeProps: any) =>
                    nodeProps.isLeaf ? null : (
                      <span className="tree-switcher-triangle">
                        {nodeProps.expanded ? '▼' : '▶'}
                      </span>
                    )
                  }
                  className="modern-tree"
                />
              ) : (
                <div className="tree-empty">
                  <div className="tree-empty-icon">🌲</div>
                  <span>解析数据后在此展示结构</span>
                </div>
              )}
            </Spin>
          </div>
          {contextMenu && (
            <div
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 1050,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Menu
                items={buildContextMenuItems(contextMenu.node)}
                onClick={() => setContextMenu(null)}
                style={{ borderRadius: 8, boxShadow: '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12)' }}
              />
            </div>
          )}
          {treeData.length > 0 && (
            <div className={`input-float-actions active`}>
              <Tooltip title="折叠所有">
                <Button
                  size="small"
                  icon={<ShrinkOutlined />}
                  onClick={() => setExpandedKeys([])}
                />
              </Tooltip>
              <Tooltip title="展开所有">
                <Button
                  size="small"
                  icon={<ArrowsAltOutlined />}
                  onClick={() => setExpandedKeys(collectAllKeys(treeData))}
                />
              </Tooltip>
              <Tooltip title="复制 JSON">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(resultJson, null, 2))
                    message.success('已复制 JSON')
                  }}
                />
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
