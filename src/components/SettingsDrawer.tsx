import { useState, useEffect } from 'react'
import { Drawer, Switch, Typography, Divider, Space, Segmented, InputNumber, message } from 'antd'
import { SunOutlined, MoonOutlined, LaptopOutlined } from '@ant-design/icons'
import { useThemeStore } from '../hooks/useTheme'
import { useJavaStatus } from '../hooks/useJavaStatus'
import ModuleManager from './ModuleManager'

const { Title, Text, Paragraph } = Typography

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDrawer({ open, onClose }: Props) {
  const { mode, setTheme } = useThemeStore()
  const javaStatus = useJavaStatus((s) => s.status)
  const [autoStart, setAutoStart] = useState(false)
  const [floatButton, setFloatButton] = useState(false)
  const [clipboardMax, setClipboardMax] = useState(500)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (open) {
      window.electronAPI?.getConfig('autoStart').then((v) => setAutoStart(!!v))
      window.electronAPI?.getConfig('floatButtonEnabled').then((v) => setFloatButton(!!v))
      window.electronAPI?.getConfig('clipboardMaxItems').then((v) => setClipboardMax(typeof v === 'number' && v > 0 ? v : 500))
      window.electronAPI?.getAppVersion?.().then((v) => setAppVersion(v || ''))
    }
  }, [open])

  useEffect(() => {
    const cleanup = window.electronAPI?.onFloatButtonToggled((enabled) => {
      setFloatButton(enabled)
    })
    return cleanup
  }, [])

  const handleAutoStartChange = async (checked: boolean) => {
    try {
      await window.electronAPI.setAutoStart(checked)
      setAutoStart(checked)
      message.success(checked ? '已开启开机自启动' : '已关闭开机自启动')
    } catch (err: any) {
      message.error('设置失败: ' + err.message)
    }
  }

  const handleFloatButtonChange = async (checked: boolean) => {
    try {
      await window.electronAPI.toggleFloatButton(checked)
      setFloatButton(checked)
      message.success(checked ? '已开启悬浮按钮' : '已关闭悬浮按钮')
    } catch (err: any) {
      message.error('设置失败: ' + err.message)
    }
  }

  const handleThemeChange = (value: string | number) => {
    const newMode = value as 'light' | 'dark' | 'auto'
    setTheme(newMode)
    window.electronAPI?.setConfig('theme', newMode)
  }

  return (
    <Drawer
      title="设置"
      placement="right"
      width={700}
      onClose={onClose}
      open={open}
    >
      <Title level={5}>常规设置</Title>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>主题模式</Text>
            <br />
            <Text type="secondary">选择应用的主题偏好</Text>
          </div>
          <Segmented
            value={mode}
            onChange={handleThemeChange}
            options={[
              { label: <span><SunOutlined /> 浅色</span>, value: 'light' },
              { label: <span><MoonOutlined /> 深色</span>, value: 'dark' },
              { label: <span><LaptopOutlined /> 自动</span>, value: 'auto' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>开机自启动</Text>
            <br />
            <Text type="secondary">系统启动时自动运行</Text>
          </div>
          <Switch
            checked={autoStart}
            onChange={handleAutoStartChange}
            disabled={window.electronAPI?.platform !== 'win32'}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>悬浮按钮</Text>
            <br />
            <Text type="secondary">在桌面显示悬浮快捷按钮</Text>
          </div>
          <Switch checked={floatButton} onChange={handleFloatButtonChange} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>剪贴板历史上限</Text>
            <br />
            <Text type="secondary">非收藏记录的最大保存条数</Text>
          </div>
          <InputNumber
            min={50}
            max={2000}
            step={50}
            value={clipboardMax}
            onChange={(v) => {
              const val = typeof v === 'number' ? v : 500
              setClipboardMax(val)
              window.electronAPI?.setConfig('clipboardMaxItems', val)
            }}
            style={{ width: 100 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong>Java 服务状态</Text>
            <br />
            <Text type="secondary">ASN.1 解析后端进程</Text>
          </div>
          <Text type={javaStatus === 'running' ? 'success' : 'danger'}>
            {javaStatus === 'running' ? '运行中' : javaStatus === 'connecting' ? '连接中...' : '已停止'}
          </Text>
        </div>
      </Space>

      <Divider />

      <Title level={5}>模块管理</Title>
      <Paragraph type="secondary">
        管理 ASN.1 类型模块。可导入包含 BerType 实现类的 JAR 文件。
      </Paragraph>

      <ModuleManager />

      <Divider />

      <div style={{ textAlign: 'center' }}>
        <Text type="secondary">
          ASN.1 / JSON Viewer v{appVersion || '1.0.0'}
          <br />
          Copyright 2026 kev17in
        </Text>
      </div>
    </Drawer>
  )
}
