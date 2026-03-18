import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react'
import {
  CodeOutlined,
  FileTextOutlined,
  LockOutlined,
  ClockCircleOutlined,
  DiffOutlined,
  QrcodeOutlined,
  AppstoreOutlined,
  CloseOutlined,
  SnippetsOutlined,
  PoweroffOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'

type DragStyle = CSSProperties & { WebkitAppRegion?: string }

interface Props {
  isDark: boolean
}

const TAB_ITEMS = [
  { key: 'asn1', label: 'ASN.1', icon: <CodeOutlined /> },
  { key: 'json', label: 'JSON', icon: <FileTextOutlined /> },
  { key: 'base64', label: '编解码', icon: <LockOutlined /> },
  { key: 'timestamp', label: '时间戳', icon: <ClockCircleOutlined /> },
  { key: 'diff', label: '对比', icon: <DiffOutlined /> },
  { key: 'qrcode', label: '二维码', icon: <QrcodeOutlined /> },
]

interface ClipboardHistoryItem {
  text: string
  time: number
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`
  return `${Math.floor(diff / 86400_000)}天前`
}

export default function FloatButton({ isDark }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardHistoryItem[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingMove = useRef<{ x: number; y: number } | null>(null)
  const rafId = useRef(0)
  const expandedAt = useRef(0)

  useEffect(() => {
    window.floatAPI?.getClipboardHistory().then((h) => {
      if (Array.isArray(h)) setClipboardHistory(h)
    })

    const cleanupHistory = window.floatAPI?.onClipboardHistoryChanged((h) => {
      if (Array.isArray(h)) setClipboardHistory(h)
    })
    return () => { cleanupHistory?.() }
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onBlur = () => {
      if (Date.now() - expandedAt.current < 300) return
      setExpanded(false)
      window.floatAPI?.setExpanded(false)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [expanded])

  const handleToggle = useCallback(async () => {
    const next = !expanded
    if (next) expandedAt.current = Date.now()
    setExpanded(next)
    await window.floatAPI?.setExpanded(next)
  }, [expanded])

  const handleShowMain = useCallback(async () => {
    await window.floatAPI?.showMainWindow()
    setExpanded(false)
    await window.floatAPI?.setExpanded(false)
  }, [])

  const handleTabClick = useCallback(async (tab: string) => {
    await window.floatAPI?.navigateToTab(tab)
    setExpanded(false)
    await window.floatAPI?.setExpanded(false)
  }, [])

  const handleCopyAndClose = useCallback(async (text: string) => {
    await window.floatAPI?.copyToClipboard(text)
    setExpanded(false)
    await window.floatAPI?.setExpanded(false)
  }, [])

  const handleDisable = useCallback(async () => {
    await window.floatAPI?.disableFloat()
  }, [])

  const handleQuit = useCallback(async () => {
    await window.floatAPI?.quitApp()
  }, [])

  const dragRef = useRef<{
    startScreenX: number
    startScreenY: number
    lastScreenX: number
    lastScreenY: number
    startWinX: number
    startWinY: number
    ready: boolean
    moved: boolean
  } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const sx = e.screenX
    const sy = e.screenY
    dragRef.current = {
      startScreenX: sx,
      startScreenY: sy,
      lastScreenX: sx,
      lastScreenY: sy,
      startWinX: 0,
      startWinY: 0,
      ready: false,
      moved: false,
    }
    window.floatAPI?.getPosition().then(pos => {
      if (pos && dragRef.current) {
        dragRef.current.startWinX = pos[0]
        dragRef.current.startWinY = pos[1]
        dragRef.current.ready = true
      }
    })
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d || !d.ready) return
      if (e.screenX === d.lastScreenX && e.screenY === d.lastScreenY) return
      d.lastScreenX = e.screenX
      d.lastScreenY = e.screenY
      const dx = e.screenX - d.startScreenX
      const dy = e.screenY - d.startScreenY
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 5) {
        d.moved = true
      }
      if (d.moved) {
        pendingMove.current = { x: d.startWinX + dx, y: d.startWinY + dy }
        if (!rafId.current) {
          rafId.current = requestAnimationFrame(() => {
            rafId.current = 0
            if (pendingMove.current) {
              window.floatAPI?.moveTo(pendingMove.current.x, pendingMove.current.y)
              pendingMove.current = null
            }
          })
        }
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = 0
      }
      if (d.moved) {
        const nx = d.startWinX + (e.screenX - d.startScreenX)
        const ny = d.startWinY + (e.screenY - d.startScreenY)
        window.floatAPI?.moveTo(nx, ny)
        window.floatAPI?.savePosition(nx, ny)
      } else if (e.button === 0) {
        window.floatAPI?.showMainWindow()
      }
      pendingMove.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleRightClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = null
    expandedAt.current = Date.now()
    setExpanded(true)
    await window.floatAPI?.setExpanded(true)
  }, [])

  const bg = isDark ? '#1a1b26' : '#ffffff'
  const fg = isDark ? '#c0caf5' : '#1d1d1f'
  const border = isDark ? '#24283b' : '#e5e7eb'
  const secondary = isDark ? '#545c7e' : '#9ca3af'
  const accent = isDark ? '#7aa2f7' : '#1a73e8'
  const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
  const dangerColor = '#ef4444'

  if (!expanded) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div
          onMouseDown={handleMouseDown}
          onContextMenu={handleRightClick}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accent}, ${isDark ? '#bb9af7' : '#6366f1'})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            userSelect: 'none',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!dragRef.current?.moved) {
              e.currentTarget.style.transform = 'scale(1.08)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)'
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              fontFamily: 'monospace',
              letterSpacing: -1,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            A1
          </span>
        </div>
      </div>
    )
  }

  const R = 16

  return (
    <div style={{ width: '100vw', height: '100vh', padding: 24, boxSizing: 'border-box' }}>
      <div
        ref={panelRef}
        style={{
          width: '100%',
          height: '100%',
          background: bg,
          borderRadius: R,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: fg,
          fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
          fontSize: 13,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${border}`,
            WebkitAppRegion: 'drag',
            flexShrink: 0,
          } as DragStyle}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: `linear-gradient(135deg, ${accent}, ${isDark ? '#bb9af7' : '#6366f1'})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                fontFamily: 'monospace',
              }}
            >
              A1
            </div>
            <span style={{ fontWeight: 600, fontSize: 12 }}>ASN.1 Viewer</span>
          </div>
          <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' } as DragStyle}>
            <button
              onClick={handleToggle}
              style={{
                width: 22, height: 22, borderRadius: 5,
                border: 'none', background: 'transparent',
                color: secondary, cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="收起"
            >
              <CloseOutlined />
            </button>
          </div>
        </div>

        {/* Show Main Window */}
        <button
          onClick={handleShowMain}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', border: 'none',
            background: 'transparent', color: fg,
            cursor: 'pointer', fontSize: 12, textAlign: 'left',
            borderBottom: `1px solid ${border}`,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <AppstoreOutlined style={{ fontSize: 13, color: accent }} />
          <span>显示主窗口</span>
        </button>

        {/* Tab Shortcuts */}
        <div style={{ padding: '6px 8px 4px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: secondary, padding: '0 4px 4px', fontWeight: 500 }}>
            快捷入口
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            {TAB_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => handleTabClick(item.key)}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 2px',
                  borderRadius: 8, border: 'none',
                  background: 'transparent', color: fg,
                  cursor: 'pointer', fontSize: 10,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 16, color: accent }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Clipboard History */}
        <div style={{ padding: '2px 10px 8px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 2px 4px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SnippetsOutlined style={{ fontSize: 11, color: secondary }} />
              <span style={{ fontSize: 10, color: secondary, fontWeight: 500 }}>剪贴板历史</span>
            </div>
            {clipboardHistory.length > 0 && (
              <span style={{ fontSize: 9, color: secondary }}>{clipboardHistory.length} 条</span>
            )}
          </div>
          <div
            style={{
              flex: 1, minHeight: 0,
              borderRadius: 8,
              background: isDark ? '#16161e' : '#f5f6f8',
              border: `1px solid ${border}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {clipboardHistory.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: secondary, fontSize: 11, fontStyle: 'italic',
              }}>
                暂无记录
              </div>
            ) : (
              clipboardHistory.slice(0, 3).map((item, i) => {
                const truncated = item.text.length > 50 ? item.text.slice(0, 50) + '...' : item.text
                return (
                  <button
                    key={`${item.time}-${i}`}
                    onClick={() => handleCopyAndClose(item.text)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '6px 8px',
                      border: 'none', background: 'transparent',
                      color: fg, cursor: 'pointer', textAlign: 'left',
                      borderBottom: i < Math.min(clipboardHistory.length, 3) - 1 ? `1px solid ${border}` : 'none',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    title="点击复制"
                  >
                    <div style={{
                      fontSize: 11, lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: 'Consolas, "Courier New", monospace',
                      maxWidth: '100%',
                    }}>
                      {truncated}
                    </div>
                    <div style={{ fontSize: 9, color: secondary }}>
                      {relativeTime(item.time)}
                    </div>
                  </button>
                )
              })
            )}
          </div>

        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${border}`,
            padding: '8px 10px',
            flexShrink: 0,
            display: 'flex',
            gap: 6,
          }}
        >
          <button
            onClick={handleDisable}
            style={{
              flex: 1, padding: '6px 0',
              borderRadius: 8, border: `1px solid ${border}`,
              background: 'transparent',
              color: secondary,
              cursor: 'pointer', fontSize: 11,
              fontWeight: 500, display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <EyeInvisibleOutlined style={{ fontSize: 11 }} />
            隐藏悬浮
          </button>
          <button
            onClick={handleQuit}
            style={{
              flex: 1, padding: '6px 0',
              borderRadius: 8, border: `1px solid ${isDark ? '#3b2020' : '#fecaca'}`,
              background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
              color: dangerColor,
              cursor: 'pointer', fontSize: 11,
              fontWeight: 500, display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)'}
            onMouseLeave={(e) => e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)'}
          >
            <PoweroffOutlined style={{ fontSize: 11 }} />
            退出应用
          </button>
        </div>
      </div>
    </div>
  )
}
