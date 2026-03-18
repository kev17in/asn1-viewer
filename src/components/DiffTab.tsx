import { useState, useMemo, useCallback, useRef } from 'react'
import { Button, Space, Tag } from 'antd'
import { ClearOutlined, RightOutlined, LeftOutlined } from '@ant-design/icons'
import { diffLines, diffChars, type Change } from 'diff'

interface Props {
  onStatusChange: (s: string) => void
  isActive?: boolean
}

interface DiffLine {
  leftNum: number | null
  rightNum: number | null
  type: 'equal' | 'added' | 'removed' | 'modified'
  leftContent: string
  rightContent: string
  leftFragments?: Change[]
  rightFragments?: Change[]
}

function buildSideBySide(left: string, right: string): DiffLine[] {
  if (!left && !right) return []
  const lineChanges = diffLines(left, right)
  const result: DiffLine[] = []
  let leftNum = 1
  let rightNum = 1

  let i = 0
  while (i < lineChanges.length) {
    const change = lineChanges[i]

    if (!change.added && !change.removed) {
      const lines = change.value.replace(/\n$/, '').split('\n')
      for (const line of lines) {
        result.push({
          leftNum: leftNum++, rightNum: rightNum++,
          type: 'equal', leftContent: line, rightContent: line,
        })
      }
      i++
    } else if (change.removed && i + 1 < lineChanges.length && lineChanges[i + 1].added) {
      const removedLines = change.value.replace(/\n$/, '').split('\n')
      const addedLines = lineChanges[i + 1].value.replace(/\n$/, '').split('\n')
      const maxLen = Math.max(removedLines.length, addedLines.length)

      for (let j = 0; j < maxLen; j++) {
        const lContent = j < removedLines.length ? removedLines[j] : ''
        const rContent = j < addedLines.length ? addedLines[j] : ''
        const hasLeft = j < removedLines.length
        const hasRight = j < addedLines.length

        let type: DiffLine['type'] = 'modified'
        if (hasLeft && !hasRight) type = 'removed'
        else if (!hasLeft && hasRight) type = 'added'

        const line: DiffLine = {
          leftNum: hasLeft ? leftNum++ : null,
          rightNum: hasRight ? rightNum++ : null,
          type, leftContent: lContent, rightContent: rContent,
        }

        if (hasLeft && hasRight && lContent !== rContent) {
          const charDiff = diffChars(lContent, rContent)
          line.leftFragments = charDiff.filter((c) => !c.added)
          line.rightFragments = charDiff.filter((c) => !c.removed)
        }

        result.push(line)
      }
      i += 2
    } else if (change.removed) {
      const lines = change.value.replace(/\n$/, '').split('\n')
      for (const line of lines) {
        result.push({
          leftNum: leftNum++, rightNum: null,
          type: 'removed', leftContent: line, rightContent: '',
        })
      }
      i++
    } else {
      const lines = change.value.replace(/\n$/, '').split('\n')
      for (const line of lines) {
        result.push({
          leftNum: null, rightNum: rightNum++,
          type: 'added', leftContent: '', rightContent: line,
        })
      }
      i++
    }
  }

  return result
}

function renderFragments(fragments: Change[], side: 'left' | 'right') {
  return fragments.map((f, i) => {
    const isDiff = side === 'left' ? f.removed : f.added
    return (
      <span key={i} className={isDiff ? `diff-char-${side}` : ''}>
        {f.value}
      </span>
    )
  })
}

const LINE_HEIGHT = 22
const PAD_TOP = 5 // border 1px + padding 4px

export default function DiffTab({ onStatusChange, isActive: _isActive }: Props) {
  const [leftText, setLeftText] = useState('')
  const [rightText, setRightText] = useState('')
  const [hoverInfo, setHoverInfo] = useState<{ side: 'left' | 'right'; idx: number } | null>(null)

  const [leftRatio, setLeftRatio] = useState(0.5)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const leftBackdropRef = useRef<HTMLDivElement>(null)
  const rightBackdropRef = useRef<HTMLDivElement>(null)
  const leftBtnRef = useRef<HTMLDivElement>(null)
  const rightBtnRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const leftTextareaRef = useRef<HTMLTextAreaElement>(null)
  const rightTextareaRef = useRef<HTMLTextAreaElement>(null)
  const syncing = useRef(false)

  const diffResult = useMemo(() => {
    if (!leftText && !rightText) return { lines: [], stats: { added: 0, removed: 0, modified: 0 } }
    const lines = buildSideBySide(leftText, rightText)
    let added = 0, removed = 0, modified = 0
    for (const l of lines) {
      if (l.type === 'added') added++
      else if (l.type === 'removed') removed++
      else if (l.type === 'modified') modified++
    }
    return { lines, stats: { added, removed, modified } }
  }, [leftText, rightText])

  const { lines } = diffResult
  const { stats } = diffResult
  const hasDiff = lines.length > 0

  const handlePanelMouse = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    const panel = e.currentTarget as HTMLElement
    const textarea = side === 'left' ? leftTextareaRef.current : rightTextareaRef.current
    const rect = panel.getBoundingClientRect()
    const scrollTop = textarea?.scrollTop ?? 0
    const y = e.clientY - rect.top - PAD_TOP + scrollTop
    const idx = Math.floor(y / LINE_HEIGHT)
    if (idx >= 0 && idx < lines.length && lines[idx].type !== 'equal') {
      setHoverInfo((prev) => (prev?.side === side && prev?.idx === idx) ? prev : { side, idx })
    } else {
      setHoverInfo((prev) => prev ? null : prev)
    }
  }, [lines])

  const handleClear = () => {
    setLeftText('')
    setRightText('')
    onStatusChange('已清空')
  }

  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return
    syncing.current = true
    const textarea = source === 'left' ? leftTextareaRef.current : rightTextareaRef.current
    const backdrop = source === 'left' ? leftBackdropRef.current : rightBackdropRef.current
    const otherBackdrop = source === 'left' ? rightBackdropRef.current : leftBackdropRef.current
    const otherTextarea = source === 'left' ? rightTextareaRef.current : leftTextareaRef.current

    if (textarea) {
      const { scrollTop, scrollLeft } = textarea
      if (backdrop) {
        backdrop.scrollTop = scrollTop
        backdrop.scrollLeft = scrollLeft
      }
      const btnOverlay = source === 'left' ? leftBtnRef.current : rightBtnRef.current
      const otherBtnOverlay = source === 'left' ? rightBtnRef.current : leftBtnRef.current
      if (btnOverlay) btnOverlay.scrollTop = scrollTop
      if (gutterRef.current) gutterRef.current.scrollTop = scrollTop
      if (otherBackdrop) otherBackdrop.scrollTop = scrollTop
      if (otherBtnOverlay) otherBtnOverlay.scrollTop = scrollTop
      if (otherTextarea) otherTextarea.scrollTop = scrollTop
    }
    syncing.current = false
  }, [])

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

  const renderBackdrop = (side: 'left' | 'right') => {
    if (!hasDiff) return null
    return lines.map((line, i) => {
      const content = side === 'left' ? line.leftContent : line.rightContent
      const fragments = side === 'left' ? line.leftFragments : line.rightFragments

      let rowClass = 'diff-inline-row'
      if (line.type === 'modified') rowClass += ' diff-inline-modified'
      else if (line.type === 'removed' && side === 'left') rowClass += ' diff-inline-removed'
      else if (line.type === 'added' && side === 'right') rowClass += ' diff-inline-added'
      else if (line.type === 'removed' && side === 'right') rowClass += ' diff-inline-empty'
      else if (line.type === 'added' && side === 'left') rowClass += ' diff-inline-empty'

      return (
        <div key={i} className={rowClass}>
          <span className="diff-inline-text">
            {fragments ? renderFragments(fragments, side) : content}
          </span>
        </div>
      )
    })
  }

  const applyToRight = useCallback((idx: number) => {
    const dl = lines[idx]
    const rightLines = rightText.split('\n')
    if (dl.type === 'modified' && dl.rightNum !== null) {
      rightLines[dl.rightNum - 1] = dl.leftContent
    } else if (dl.type === 'removed') {
      let insertAt = rightLines.length
      for (let j = idx + 1; j < lines.length; j++) {
        if (lines[j].rightNum !== null) { insertAt = lines[j].rightNum! - 1; break }
      }
      rightLines.splice(insertAt, 0, dl.leftContent)
    } else if (dl.type === 'added' && dl.rightNum !== null) {
      rightLines.splice(dl.rightNum - 1, 1)
    }
    setRightText(rightLines.join('\n'))
    setHoverInfo(null)
  }, [lines, rightText])

  const applyToLeft = useCallback((idx: number) => {
    const dl = lines[idx]
    const leftLines = leftText.split('\n')
    if (dl.type === 'modified' && dl.leftNum !== null) {
      leftLines[dl.leftNum - 1] = dl.rightContent
    } else if (dl.type === 'added') {
      let insertAt = leftLines.length
      for (let j = idx + 1; j < lines.length; j++) {
        if (lines[j].leftNum !== null) { insertAt = lines[j].leftNum! - 1; break }
      }
      leftLines.splice(insertAt, 0, dl.rightContent)
    } else if (dl.type === 'removed' && dl.leftNum !== null) {
      leftLines.splice(dl.leftNum - 1, 1)
    }
    setLeftText(leftLines.join('\n'))
    setHoverInfo(null)
  }, [lines, leftText])

  const renderGutterRows = () => {
    return lines.map((line, i) => {
      let rowClass = 'diff-gutter-row'
      if (line.type !== 'equal') rowClass += ` diff-gutter-${line.type}`
      return (
        <div key={i} className={rowClass}>
          <span className="diff-gutter-num-left">{line.leftNum ?? ''}</span>
          <span className="diff-gutter-num-right">{line.rightNum ?? ''}</span>
        </div>
      )
    })
  }

  const renderBtnOverlay = (side: 'left' | 'right') => {
    if (!hasDiff || !hoverInfo || hoverInfo.side !== side) return null
    const i = hoverInfo.idx
    if (i < 0 || i >= lines.length || lines[i].type === 'equal') return null
    const top = 4 + i * LINE_HEIGHT
    return (
      <div className="diff-btn-row" style={{ position: 'absolute', top, width: '100%' }}>
        {side === 'left' && (
          <span
            className="diff-apply-btn diff-apply-btn-right diff-apply-btn-visible"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); applyToRight(i) }}
            title="覆盖到右边"
          >
            <RightOutlined />
          </span>
        )}
        {side === 'right' && (
          <span
            className="diff-apply-btn diff-apply-btn-left diff-apply-btn-visible"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); applyToLeft(i) }}
            title="覆盖到左边"
          >
            <LeftOutlined />
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8, marginTop: 8 }}>
        <Button icon={<ClearOutlined />} onClick={handleClear}>
          清空
        </Button>
        {(stats.added > 0 || stats.removed > 0 || stats.modified > 0) && (
          <>
            {stats.added > 0 && <Tag color="green">+{stats.added} 新增</Tag>}
            {stats.removed > 0 && <Tag color="red">-{stats.removed} 删除</Tag>}
            {stats.modified > 0 && <Tag color="orange">~{stats.modified} 修改</Tag>}
          </>
        )}
      </Space>

      <div style={{ display: 'flex', marginBottom: 4 }}>
        <div style={{ width: `calc(${leftRatio * 100}% - 40px)`, fontWeight: 500, fontSize: 12, color: '#888' }}>原始文本</div>
        <div style={{ width: 80 }} />
        <div style={{ flex: 1, fontWeight: 500, fontSize: 12, color: '#888' }}>修改后文本</div>
      </div>

      <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel */}
        <div
          className="diff-editor-panel"
          style={{ width: `calc(${leftRatio * 100}% - 40px)` }}
          onMouseMove={(e) => handlePanelMouse(e, 'left')}
          onMouseLeave={() => setHoverInfo(null)}
        >
          <div ref={leftBackdropRef} className="diff-backdrop">
            {renderBackdrop('left')}
          </div>
          <textarea
            ref={leftTextareaRef}
            className="diff-editor-input"
            wrap="off"
            value={leftText}
            onChange={(e) => setLeftText(e.target.value)}
            onScroll={() => handleScroll('left')}
            placeholder="输入原始文本..."
          />
          <div ref={leftBtnRef} className="diff-btn-overlay">
            {renderBtnOverlay('left')}
          </div>
        </div>

        {/* Center gutter */}
        <div
          className="diff-gutter"
          ref={gutterRef}
          onMouseDown={onDragStart}
        >
          {hasDiff ? renderGutterRows() : <div className="diff-gutter-empty" />}
        </div>

        {/* Right panel */}
        <div
          className="diff-editor-panel"
          style={{ width: `calc(${(1 - leftRatio) * 100}% - 40px)` }}
          onMouseMove={(e) => handlePanelMouse(e, 'right')}
          onMouseLeave={() => setHoverInfo(null)}
        >
          <div ref={rightBackdropRef} className="diff-backdrop">
            {renderBackdrop('right')}
          </div>
          <textarea
            ref={rightTextareaRef}
            className="diff-editor-input"
            wrap="off"
            value={rightText}
            onChange={(e) => setRightText(e.target.value)}
            onScroll={() => handleScroll('right')}
            placeholder="输入修改后文本..."
          />
          <div ref={rightBtnRef} className="diff-btn-overlay">
            {renderBtnOverlay('right')}
          </div>
        </div>
      </div>
    </div>
  )
}
