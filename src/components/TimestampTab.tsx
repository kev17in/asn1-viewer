import { useState, useEffect, useCallback } from 'react'
import { Button, Input, InputNumber, Select, Space, Tag, Tooltip, message } from 'antd'
import {
  ClockCircleOutlined, SwapOutlined, CopyOutlined, PlusOutlined, MinusOutlined,
  CalculatorOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/zh-cn'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.extend(advancedFormat)
dayjs.extend(isoWeek)
dayjs.locale('zh-cn')

const { TextArea } = Input

interface Props {
  onStatusChange: (s: string) => void
}

const TIMEZONE_OPTIONS = [
  { label: 'UTC', value: 'UTC' },
  { label: '中国标准时间 (UTC+8)', value: 'Asia/Shanghai' },
  { label: '日本标准时间 (UTC+9)', value: 'Asia/Tokyo' },
  { label: '美国东部时间 (UTC-5)', value: 'America/New_York' },
  { label: '美国太平洋时间 (UTC-8)', value: 'America/Los_Angeles' },
  { label: '英国时间 (UTC+0)', value: 'Europe/London' },
  { label: '欧洲中部时间 (UTC+1)', value: 'Europe/Berlin' },
]

interface FormatRow {
  label: string
  value: string
}

function smartParse(input: string, tz: string): dayjs.Dayjs | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d{1,13}$/.test(trimmed)) {
    let ts = parseInt(trimmed, 10)
    if (trimmed.length <= 10) ts *= 1000
    const d = dayjs(ts)
    return d.isValid() ? d : null
  }
  const d = dayjs.tz(trimmed, tz)
  return d.isValid() ? d : null
}

function buildFormats(d: dayjs.Dayjs, tz: string): FormatRow[] {
  const local = d.tz(tz)
  return [
    { label: '秒时间戳', value: String(Math.floor(d.valueOf() / 1000)) },
    { label: '毫秒时间戳', value: String(d.valueOf()) },
    { label: '本地时间', value: local.format('YYYY-MM-DD HH:mm:ss') },
    { label: 'UTC 时间', value: d.utc().format('YYYY-MM-DD HH:mm:ss') },
    { label: 'ISO 8601', value: d.toISOString() },
    { label: 'RFC 2822', value: local.format('ddd, DD MMM YYYY HH:mm:ss ZZ') },
    { label: '相对时间', value: d.fromNow() },
  ]
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  const totalSec = Math.floor(abs / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  parts.push(`${seconds} 秒`)
  const prefix = ms < 0 ? '-' : ''
  return `${prefix}${parts.join(' ')}  (共 ${totalSec.toLocaleString()} 秒)`
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

export default function TimestampTab({ onStatusChange }: Props) {
  const [selectedTz, setSelectedTz] = useState('Asia/Shanghai')

  // Live clock
  const [now, setNow] = useState(dayjs())
  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Core conversion
  const [convertInput, setConvertInput] = useState('')
  const [formats, setFormats] = useState<FormatRow[]>([])

  const doConvert = useCallback((input: string) => {
    const d = smartParse(input, selectedTz)
    if (!d) {
      message.warning('无法识别的时间格式')
      setFormats([])
      return
    }
    setFormats(buildFormats(d, selectedTz))
    onStatusChange('转换成功')
  }, [selectedTz, onStatusChange])

  const handleConvert = () => {
    if (!convertInput.trim()) { message.warning('请输入时间戳或日期'); return }
    doConvert(convertInput)
  }

  const handleNow = () => {
    const n = dayjs()
    const ts = String(n.valueOf())
    setConvertInput(ts)
    setFormats(buildFormats(n, selectedTz))
    onStatusChange('已获取当前时间')
  }

  const handlePreset = (d: dayjs.Dayjs) => {
    const ts = String(d.valueOf())
    setConvertInput(ts)
    setFormats(buildFormats(d, selectedTz))
    onStatusChange('快捷时间已填入')
  }

  // Time diff
  const [diffA, setDiffA] = useState('')
  const [diffB, setDiffB] = useState('')
  const [diffResult, setDiffResult] = useState('')

  const handleDiff = () => {
    const a = smartParse(diffA, selectedTz)
    const b = smartParse(diffB, selectedTz)
    if (!a || !b) { message.warning('请输入有效的时间'); return }
    const ms = b.valueOf() - a.valueOf()
    setDiffResult(formatDuration(ms))
    onStatusChange('时间差计算完成')
  }

  // Time add/subtract
  const [addBase, setAddBase] = useState('')
  const [addDays, setAddDays] = useState<number>(0)
  const [addHours, setAddHours] = useState<number>(0)
  const [addMinutes, setAddMinutes] = useState<number>(0)
  const [addSeconds, setAddSeconds] = useState<number>(0)
  const [addMode, setAddMode] = useState<'add' | 'sub'>('add')
  const [addResult, setAddResult] = useState<FormatRow[]>([])

  const handleAddCalc = () => {
    const base = smartParse(addBase, selectedTz)
    if (!base) { message.warning('请输入有效的基准时间'); return }
    const totalMs = ((addDays * 86400) + (addHours * 3600) + (addMinutes * 60) + addSeconds) * 1000
    const result = addMode === 'add' ? base.add(totalMs, 'ms') : base.subtract(totalMs, 'ms')
    setAddResult(buildFormats(result, selectedTz))
    onStatusChange('时间加减计算完成')
  }

  // Batch convert
  const [batchInput, setBatchInput] = useState('')
  const [batchOutput, setBatchOutput] = useState('')

  const handleBatch = () => {
    const lines = batchInput.split('\n').filter((l) => l.trim())
    if (lines.length === 0) { message.warning('请输入时间戳（每行一个）'); return }
    const results = lines.map((line) => {
      const d = smartParse(line.trim(), selectedTz)
      if (!d) return `${line.trim()} → 无法识别`
      return `${line.trim()} → ${d.tz(selectedTz).format('YYYY-MM-DD HH:mm:ss')}`
    })
    setBatchOutput(results.join('\n'))
    onStatusChange(`批量转换完成: ${lines.length} 条`)
  }

  const nowLocal = now.tz(selectedTz)

  return (
    <div className="ts-page">
      {/* ── Live Clock ── */}
      <div className="ts-clock">
        <div className="ts-clock-time">{nowLocal.format('YYYY-MM-DD HH:mm:ss')}</div>
        <div className="ts-clock-ts">
          <span className="ts-clock-label">Unix</span>
          <span
            className="ts-clock-value"
            onClick={() => copyText(String(now.unix()))}
            title="点击复制"
          >
            {now.unix()}
          </span>
          <span className="ts-clock-label">ms</span>
          <span
            className="ts-clock-value"
            onClick={() => copyText(String(now.valueOf()))}
            title="点击复制"
          >
            {now.valueOf()}
          </span>
        </div>
        <Space size={8} style={{ marginTop: 6 }}>
          <Select
            style={{ width: 260 }}
            size="small"
            value={selectedTz}
            onChange={setSelectedTz}
            options={TIMEZONE_OPTIONS}
          />
          <Button size="small" icon={<ClockCircleOutlined />} onClick={handleNow}>
            填入当前时间
          </Button>
        </Space>
      </div>

      <div className="ts-body">
        {/* ── Core Convert ── */}
        <div className="ts-section">
          <div className="ts-section-title">时间戳 / 日期转换</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={convertInput}
              onChange={(e) => setConvertInput(e.target.value)}
              onPressEnter={handleConvert}
              placeholder="输入时间戳 (秒/毫秒) 或日期 (YYYY-MM-DD HH:mm:ss)"
              style={{ fontFamily: 'Consolas, monospace' }}
            />
            <Button type="primary" icon={<SwapOutlined />} onClick={handleConvert}>
              转换
            </Button>
          </Space.Compact>

          {/* Quick Presets */}
          <div className="ts-presets">
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).startOf('day'))}>今天 00:00</Tag>
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).endOf('day'))}>今天 23:59</Tag>
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).startOf('isoWeek'))}>本周一</Tag>
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).endOf('isoWeek'))}>本周日</Tag>
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).startOf('month'))}>本月初</Tag>
            <Tag className="ts-preset-tag" onClick={() => handlePreset(dayjs().tz(selectedTz).endOf('month'))}>本月末</Tag>
          </div>

          {/* Multi-format Output */}
          {formats.length > 0 && (
            <div className="ts-formats">
              <div className="ts-formats-header">
                <span>多格式输出</span>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyText(formats.map((f) => `${f.label}: ${f.value}`).join('\n'))}
                >
                  全部复制
                </Button>
              </div>
              {formats.map((f) => (
                <div key={f.label} className="ts-format-row">
                  <span className="ts-format-label">{f.label}</span>
                  <span className="ts-format-value">{f.value}</span>
                  <Tooltip title="复制">
                    <CopyOutlined className="ts-format-copy" onClick={() => copyText(f.value)} />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Time Diff ── */}
        <div className="ts-section">
          <div className="ts-section-title">时间差计算</div>
          <div className="ts-diff-row">
            <Input
              value={diffA}
              onChange={(e) => setDiffA(e.target.value)}
              placeholder="时间 A (时间戳或日期)"
              style={{ flex: 1, fontFamily: 'Consolas, monospace' }}
            />
            <span className="ts-diff-sep">—</span>
            <Input
              value={diffB}
              onChange={(e) => setDiffB(e.target.value)}
              placeholder="时间 B (时间戳或日期)"
              style={{ flex: 1, fontFamily: 'Consolas, monospace' }}
            />
            <Button icon={<CalculatorOutlined />} onClick={handleDiff}>计算</Button>
          </div>
          {diffResult && (
            <div className="ts-diff-result">
              <span>{diffResult}</span>
              <CopyOutlined className="ts-format-copy" onClick={() => copyText(diffResult)} />
            </div>
          )}
        </div>

        {/* ── Time Add/Subtract ── */}
        <div className="ts-section">
          <div className="ts-section-title">时间加减</div>
          <div className="ts-add-row">
            <Input
              value={addBase}
              onChange={(e) => setAddBase(e.target.value)}
              placeholder="基准时间 (时间戳或日期)"
              style={{ flex: 1, fontFamily: 'Consolas, monospace' }}
            />
            <Button
              icon={addMode === 'add' ? <PlusOutlined /> : <MinusOutlined />}
              onClick={() => setAddMode((m) => (m === 'add' ? 'sub' : 'add'))}
              type={addMode === 'add' ? 'primary' : 'default'}
              danger={addMode === 'sub'}
              style={{ width: 40 }}
            />
            <InputNumber value={addDays} onChange={(v) => setAddDays(v ?? 0)} min={0} addonAfter="天" style={{ width: 110 }} />
            <InputNumber value={addHours} onChange={(v) => setAddHours(v ?? 0)} min={0} max={23} addonAfter="时" style={{ width: 110 }} />
            <InputNumber value={addMinutes} onChange={(v) => setAddMinutes(v ?? 0)} min={0} max={59} addonAfter="分" style={{ width: 110 }} />
            <InputNumber value={addSeconds} onChange={(v) => setAddSeconds(v ?? 0)} min={0} max={59} addonAfter="秒" style={{ width: 110 }} />
            <Button icon={<CalculatorOutlined />} onClick={handleAddCalc}>计算</Button>
          </div>
          {addResult.length > 0 && (
            <div className="ts-formats ts-formats-compact">
              {addResult.map((f) => (
                <div key={f.label} className="ts-format-row">
                  <span className="ts-format-label">{f.label}</span>
                  <span className="ts-format-value">{f.value}</span>
                  <Tooltip title="复制">
                    <CopyOutlined className="ts-format-copy" onClick={() => copyText(f.value)} />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Batch Convert ── */}
        <div className="ts-section">
          <div className="ts-section-title">
            <span>批量转换</span>
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={handleBatch}>
              转换
            </Button>
          </div>
          <div className="ts-batch">
            <TextArea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder={'每行一个时间戳或日期，例如:\n1710000000\n2024-03-10 08:00:00\n1710000000000'}
              style={{ flex: 1, resize: 'none', fontFamily: 'Consolas, monospace' }}
              rows={5}
            />
            <TextArea
              value={batchOutput}
              readOnly
              placeholder="转换结果"
              style={{ flex: 1, resize: 'none', fontFamily: 'Consolas, monospace' }}
              rows={5}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
