import { useEffect, useState, useCallback } from 'react'
import { ConfigProvider, Tabs, Tooltip } from 'antd'
import {
  CodeOutlined,
  FileTextOutlined,
  LockOutlined,
  ClockCircleOutlined,
  DiffOutlined,
  QrcodeOutlined,
  SnippetsOutlined,
  CheckSquareOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  LaptopOutlined,
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  BlockOutlined,
} from '@ant-design/icons'
import { useAntdTheme, useThemeStore } from './hooks/useTheme'
import { useJavaStatus, initJavaStatusListener } from './hooks/useJavaStatus'
import Asn1Tab from './components/Asn1Tab'
import JsonTab from './components/JsonTab'
import Base64Tab from './components/Base64Tab'
import TimestampTab from './components/TimestampTab'
import DiffTab from './components/DiffTab'
import QrCodeTab from './components/QrCodeTab'
import ClipboardHistoryTab from './components/ClipboardHistoryTab'
import TodoTab from './components/TodoTab'
import CertTab from './components/CertTab'
import SubTabs from './components/SubTabs'
import SettingsDrawer from './components/SettingsDrawer'

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  connecting: { dot: '#faad14', label: '连接中...' },
  running: { dot: '#52c41a', label: '已就绪' },
  stopped: { dot: '#ff4d4f', label: '已停止' },
  error: { dot: '#ff4d4f', label: '错误' },
}

const isMac = window.electronAPI?.platform === 'darwin'

export default function App() {
  const themeConfig = useAntdTheme()
  const { mode, effectiveTheme, toggleTheme } = useThemeStore()
  const javaStatus = useJavaStatus((s) => s.status)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statusText, setStatusText] = useState('就绪')
  const [isMaximized, setIsMaximized] = useState(false)
  const [activeTab, setActiveTab] = useState('asn1')

  useEffect(() => {
    const cleanup = initJavaStatusListener()

    window.electronAPI?.getSystemTheme().then((st) => {
      if (st === 'dark' || st === 'light') {
        useThemeStore.getState().setSystemTheme(st as 'light' | 'dark')
      }
    })

    window.electronAPI?.getConfig('theme').then((t) => {
      if (t === 'dark' || t === 'light' || t === 'auto') {
        useThemeStore.getState().setTheme(t as 'light' | 'dark' | 'auto')
      }
    })

    const cleanupSystemTheme = window.electronAPI?.onSystemThemeChanged((st) => {
      if (st === 'dark' || st === 'light') {
        useThemeStore.getState().setSystemTheme(st as 'light' | 'dark')
      }
    })

    window.electronAPI?.windowIsMaximized?.().then(setIsMaximized)

    const cleanupNav = window.electronAPI?.onNavigateTab((tab, clipboardContent) => {
      setActiveTab(tab)
      if (clipboardContent) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('float-clipboard-input', { detail: { tab, content: clipboardContent } }),
          )
        }, 100)
      }
    })

    if (!isMac) {
      const mkCursor = (fg: string, bg: string) => {
        const c = document.createElement('canvas')
        c.width = 32; c.height = 32
        const g = c.getContext('2d')!
        const draw = (color: string, w: number) => {
          g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'
          for (const [x1, y1, x2, y2] of [[10, 6, 22, 6], [16, 6, 16, 26], [10, 26, 22, 26]]) {
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
          }
        }
        draw(bg, 4)
        draw(fg, 1.5)
        return c.toDataURL('image/png')
      }
      const sels = ['textarea', 'input[type="text"]', 'input[type="search"]', 'input:not([type])', '.ant-input', '.ant-select-selection-search-input', '.ant-cascader input', '.ant-input-number-input']
      const lightUrl = mkCursor('#333', '#fff')
      const darkUrl = mkCursor('#c0caf5', '#1a1b26')
      const cur = (url: string) => `cursor:url(${url}) 16 16,text!important`
      const el = document.createElement('style')
      el.id = 'win-text-cursor'
      el.textContent = `${sels.join(',')}{${cur(lightUrl)}} ${sels.map(s => `.dark ${s}`).join(',')}{${cur(darkUrl)}}`
      document.head.appendChild(el)
    }

    return () => {
      cleanup()
      cleanupNav?.()
      cleanupSystemTheme?.()
    }
  }, [])

  const isDark = effectiveTheme === 'dark'
  const statusInfo = STATUS_MAP[javaStatus] || STATUS_MAP.connecting

  const tabItems = [
    { key: 'asn1', label: <span><CodeOutlined /> ASN.1 解析</span>, children: <SubTabs Component={Asn1Tab} onStatusChange={setStatusText} name="ASN.1" /> },
    { key: 'json', label: <span><FileTextOutlined /> JSON</span>, children: <SubTabs Component={JsonTab} onStatusChange={setStatusText} name="JSON" /> },
    { key: 'base64', label: <span><LockOutlined /> 编解码</span>, children: <Base64Tab onStatusChange={setStatusText} /> },
    { key: 'timestamp', label: <span><ClockCircleOutlined /> 时间戳</span>, children: <TimestampTab onStatusChange={setStatusText} /> },
    { key: 'diff', label: <span><DiffOutlined /> 对比</span>, children: <SubTabs Component={DiffTab} onStatusChange={setStatusText} name="对比" /> },
    { key: 'qrcode', label: <span><QrcodeOutlined /> 二维码</span>, children: <QrCodeTab onStatusChange={setStatusText} /> },
    { key: 'cert', label: <span><SafetyCertificateOutlined /> 证书</span>, children: <SubTabs Component={CertTab} onStatusChange={setStatusText} name="证书" /> },
    { key: 'clipboard', label: <span><SnippetsOutlined /> 剪贴板</span>, children: <ClipboardHistoryTab onStatusChange={setStatusText} /> },
    { key: 'todo', label: <span><CheckSquareOutlined /> 待办</span>, children: <TodoTab onStatusChange={setStatusText} /> },
  ]

  const handleMaximize = async () => {
    const result = await window.electronAPI?.windowMaximize()
    setIsMaximized(!!result)
  }

  return (
    <ConfigProvider theme={{ algorithm: themeConfig.algorithm, token: themeConfig.token }}>
      <div className={`app-shell ${isDark ? 'dark' : 'light'}${isMac ? ' is-mac' : ''}`}>
        {/* Custom Title Bar */}
        <header className="titlebar">
          <div className="titlebar-drag">
            <div className="titlebar-logo">
              <div className="logo-icon">A1</div>
              <span className="logo-text">ASN.1 Viewer</span>
            </div>
          </div>

          <div className="titlebar-actions">
            <div className="status-badge">
              <span className="status-dot" style={{ background: statusInfo.dot }} />
              <span className="status-label">{statusInfo.label}</span>
            </div>

            <Tooltip title={mode === 'light' ? '切换到深色' : mode === 'dark' ? '切换到自动' : '切换到浅色'} mouseEnterDelay={0.5}>
              <button className="titlebar-btn" onClick={toggleTheme}>
                {mode === 'auto' ? <LaptopOutlined /> : isDark ? <MoonOutlined /> : <SunOutlined />}
              </button>
            </Tooltip>

            <Tooltip title="设置" mouseEnterDelay={0.5}>
              <button className="titlebar-btn" onClick={() => setSettingsOpen(true)}>
                <SettingOutlined />
              </button>
            </Tooltip>

            {!isMac && (
              <div className="window-controls">
                <button className="win-btn" onClick={() => window.electronAPI?.windowMinimize()}>
                  <MinusOutlined />
                </button>
                <button className="win-btn" onClick={handleMaximize}>
                  {isMaximized ? <BlockOutlined style={{ fontSize: 12 }} /> : <BorderOutlined style={{ fontSize: 12 }} />}
                </button>
                <button className="win-btn win-close" onClick={() => window.electronAPI?.windowClose()}>
                  <CloseOutlined />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="app-content">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            className="main-tabs"
            tabBarStyle={{ margin: 0, padding: '0 12px' }}
          />
        </main>

        {/* Status Bar */}
        <footer className="statusbar">
          <span>{statusText}</span>
          <span>v1.0.0</span>
        </footer>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ConfigProvider>
  )
}
