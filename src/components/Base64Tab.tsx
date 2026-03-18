import { useState, useRef } from 'react'
import { Button, Input, Space, Tooltip, Select, Switch, message } from 'antd'
import {
  ClearOutlined, CopyOutlined, DownloadOutlined, ThunderboltOutlined,
  KeyOutlined, LockOutlined, UnlockOutlined, ReloadOutlined,
  SwapOutlined, NumberOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

interface Props {
  onStatusChange: (s: string) => void
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

interface HashRow { label: string; value: string }

type TabKey = 'codec' | 'hash' | 'numconv' | 'obfuscate' | 'aes' | 'rsa' | 'keygen'

const SIDEBAR_ITEMS: { key: TabKey; icon: React.ReactNode; label: string }[] = [
  { key: 'codec', icon: <SwapOutlined />, label: '编解码' },
  { key: 'hash', icon: <NumberOutlined />, label: '哈希计算' },
  { key: 'numconv', icon: <SwapOutlined />, label: '数值转换' },
  { key: 'obfuscate', icon: <ThunderboltOutlined />, label: '混淆' },
  { key: 'aes', icon: <LockOutlined />, label: 'AES' },
  { key: 'rsa', icon: <SafetyCertificateOutlined />, label: 'RSA' },
  { key: 'keygen', icon: <KeyOutlined />, label: '密钥生成' },
]

export default function Base64Tab({ onStatusChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('codec')

  // ── Encoding state ──
  const [base64Text, setBase64Text] = useState('')
  const [hexText, setHexText] = useState('')
  const [plainText, setPlainText] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlOutput, setUrlOutput] = useState('')
  const [lastBytes, setLastBytes] = useState<Uint8Array | null>(null)
  const editing = useRef<'base64' | 'hex' | 'text' | null>(null)

  // ── Hash state ──
  const [hashInput, setHashInput] = useState('')
  const [hashInputEnc, setHashInputEnc] = useState('utf-8')
  const [hashResults, setHashResults] = useState<HashRow[]>([])
  const [hmacEnabled, setHmacEnabled] = useState(false)
  const [hmacKey, setHmacKey] = useState('')
  const [hmacKeyEnc, setHmacKeyEnc] = useState('utf-8')

  // ── AES state ──
  const [aesMode, setAesMode] = useState('cbc')
  const [aesInput, setAesInput] = useState('')
  const [aesInputEnc, setAesInputEnc] = useState('utf-8')
  const [aesKey, setAesKey] = useState('')
  const [aesIv, setAesIv] = useState('')
  const [aesOutputHex, setAesOutputHex] = useState('')
  const [aesOutputExtra, setAesOutputExtra] = useState('')
  const [aesOutputLabel, setAesOutputLabel] = useState<[string, string]>(['Hex', 'Base64'])

  // ── RSA state ──
  const [rsaPadding, setRsaPadding] = useState('oaep')
  const [rsaInputEnc, setRsaInputEnc] = useState('utf-8')
  const [rsaInput, setRsaInput] = useState('')
  const [rsaKeyPem, setRsaKeyPem] = useState('')
  const [rsaOutputHex, setRsaOutputHex] = useState('')
  const [rsaOutputExtra, setRsaOutputExtra] = useState('')
  const [rsaOutputLabel, setRsaOutputLabel] = useState<[string, string]>(['Hex', 'Base64'])

  // ── KeyGen state ──
  const [randomLen, setRandomLen] = useState(16)
  const [randomHex, setRandomHex] = useState('')
  const [randomBase64, setRandomBase64] = useState('')
  const [aesKeyBits, setAesKeyBits] = useState(128)
  const [aesKeyHex, setAesKeyHex] = useState('')
  const [rsaBits, setRsaBits] = useState(2048)
  const [rsaPublicKey, setRsaPublicKey] = useState('')
  const [rsaPrivateKey, setRsaPrivateKey] = useState('')
  const [rsaLoading, setRsaLoading] = useState(false)

  // ── Number conversion state ──
  const [numDecimal, setNumDecimal] = useState('')
  const [numHex, setNumHex] = useState('')
  const [numOctal, setNumOctal] = useState('')
  const [numBinary, setNumBinary] = useState('')

  // ── Obfuscation state ──
  const [obfInput, setObfInput] = useState('')
  const [obfOutput, setObfOutput] = useState('')

  // ── Encoding handlers ──

  const syncFromBytes = (bytes: Uint8Array, source: 'base64' | 'hex' | 'text') => {
    setLastBytes(bytes)
    if (source !== 'base64') setBase64Text(bytesToBase64(bytes))
    if (source !== 'hex') setHexText(bytesToHex(bytes))
    if (source !== 'text') {
      try { setPlainText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
      catch { setPlainText('') }
    }
    onStatusChange(`${bytes.length} 字节`)
  }

  const clearEncoding = () => {
    setBase64Text(''); setHexText(''); setPlainText(''); setLastBytes(null)
    onStatusChange('已清空')
  }

  const handleBase64Change = (val: string) => {
    editing.current = 'base64'
    setBase64Text(val)
    if (!val.trim()) { setHexText(''); setPlainText(''); setLastBytes(null); return }
    try {
      const bytes = base64ToBytes(val.trim())
      syncFromBytes(bytes, 'base64')
    } catch { setHexText(''); setPlainText(''); setLastBytes(null) }
    editing.current = null
  }

  const handleHexChange = (val: string) => {
    editing.current = 'hex'
    setHexText(val)
    const clean = val.replace(/\s+/g, '')
    if (!clean) { setBase64Text(''); setPlainText(''); setLastBytes(null); return }
    if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
      setBase64Text(''); setPlainText(''); setLastBytes(null); return
    }
    try {
      const bytes = hexToBytes(clean)
      syncFromBytes(bytes, 'hex')
    } catch { setBase64Text(''); setPlainText(''); setLastBytes(null) }
    editing.current = null
  }

  const handlePlainTextChange = (val: string) => {
    editing.current = 'text'
    setPlainText(val)
    if (!val) { setBase64Text(''); setHexText(''); setLastBytes(null); return }
    const bytes = new TextEncoder().encode(val)
    syncFromBytes(bytes, 'text')
    editing.current = null
  }

  const handleUrlEncode = () => {
    if (!urlInput.trim()) return
    setUrlOutput(encodeURIComponent(urlInput))
    onStatusChange('URL 编码完成')
  }

  const handleUrlDecode = () => {
    if (!urlInput.trim()) return
    try {
      setUrlOutput(decodeURIComponent(urlInput))
      onStatusChange('URL 解码完成')
    } catch { message.error('URL 解码失败') }
  }

  const handleExportBinary = async () => {
    if (!lastBytes) { message.warning('请先完成一次转换'); return }
    try {
      const ok = await window.electronAPI.saveFile(Array.from(lastBytes), 'output.bin')
      if (ok) message.success('导出成功')
    } catch (err: any) { message.error('导出失败: ' + err.message) }
  }

  // ── Hash handlers ──

  const handleHashCompute = async () => {
    if (!hashInput.trim()) { message.warning('请输入数据'); return }
    try {
      const algos = ['md5', 'sha1', 'sha256', 'sha512']
      const labels = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']
      const results: HashRow[] = []
      for (let i = 0; i < algos.length; i++) {
        let hash: string
        if (hmacEnabled && hmacKey) {
          hash = await window.electronAPI.cryptoHmac(algos[i], hashInput, hmacKey, hashInputEnc, hmacKeyEnc)
        } else {
          hash = await window.electronAPI.cryptoHash(algos[i], hashInput, hashInputEnc)
        }
        results.push({ label: hmacEnabled ? `HMAC-${labels[i]}` : labels[i], value: hash.toUpperCase() })
      }
      setHashResults(results)
      onStatusChange('哈希计算完成')
    } catch (err: any) {
      message.error('计算失败: ' + err.message)
    }
  }

  // ── AES handlers ──

  const handleAesEncrypt = async () => {
    if (!aesInput.trim() || !aesKey.trim()) { message.warning('请输入明文和密钥'); return }
    if (aesMode === 'cbc' && !aesIv.trim()) { message.warning('CBC 模式需要 IV'); return }
    try {
      const result = await window.electronAPI.cryptoAes('encrypt', aesMode, aesKey, aesIv, aesInput, aesInputEnc)
      setAesOutputHex(result.hex?.toUpperCase() || '')
      setAesOutputExtra(result.base64 || '')
      setAesOutputLabel(['Hex', 'Base64'])
      onStatusChange('AES 加密成功')
    } catch (err: any) { message.error('加密失败: ' + err.message) }
  }

  const handleAesDecrypt = async () => {
    if (!aesInput.trim() || !aesKey.trim()) { message.warning('请输入密文和密钥'); return }
    if (aesMode === 'cbc' && !aesIv.trim()) { message.warning('CBC 模式需要 IV'); return }
    try {
      const result = await window.electronAPI.cryptoAes('decrypt', aesMode, aesKey, aesIv, aesInput, aesInputEnc)
      setAesOutputHex(result.hex?.toUpperCase() || '')
      setAesOutputExtra(result.text || '')
      setAesOutputLabel(['Hex', 'UTF-8 Text'])
      onStatusChange('AES 解密成功')
    } catch (err: any) { message.error('解密失败: ' + err.message) }
  }

  // ── RSA handlers ──

  const handleRsaEncrypt = async () => {
    if (!rsaInput.trim() || !rsaKeyPem.trim()) { message.warning('请输入明文和公钥'); return }
    try {
      const result = await window.electronAPI.cryptoRsa('encrypt', rsaKeyPem, rsaInput, rsaInputEnc, rsaPadding)
      setRsaOutputHex(result.hex?.toUpperCase() || '')
      setRsaOutputExtra(result.base64 || '')
      setRsaOutputLabel(['Hex', 'Base64'])
      onStatusChange('RSA 加密成功')
    } catch (err: any) { message.error('加密失败: ' + err.message) }
  }

  const handleRsaDecrypt = async () => {
    if (!rsaInput.trim() || !rsaKeyPem.trim()) { message.warning('请输入密文和私钥'); return }
    try {
      const result = await window.electronAPI.cryptoRsa('decrypt', rsaKeyPem, rsaInput, rsaInputEnc, rsaPadding)
      setRsaOutputHex(result.hex?.toUpperCase() || '')
      setRsaOutputExtra(result.text || '')
      setRsaOutputLabel(['Hex', 'UTF-8 Text'])
      onStatusChange('RSA 解密成功')
    } catch (err: any) { message.error('解密失败: ' + err.message) }
  }

  // ── KeyGen handlers ──

  const handleGenRandom = async () => {
    try {
      const r = await window.electronAPI.cryptoGenerateKey('random', randomLen * 8)
      setRandomHex(r.hex?.toUpperCase() || '')
      setRandomBase64(r.base64 || '')
      onStatusChange(`已生成 ${randomLen} 字节随机数`)
    } catch (err: any) { message.error('生成失败: ' + err.message) }
  }

  const handleGenAesKey = async () => {
    try {
      const r = await window.electronAPI.cryptoGenerateKey('aes', aesKeyBits)
      setAesKeyHex(r.hex?.toUpperCase() || '')
      onStatusChange(`已生成 AES-${aesKeyBits} 密钥`)
    } catch (err: any) { message.error('生成失败: ' + err.message) }
  }

  const handleGenRsa = async () => {
    setRsaLoading(true)
    try {
      const r = await window.electronAPI.cryptoGenerateKey('rsa', rsaBits)
      setRsaPublicKey(r.publicKey || '')
      setRsaPrivateKey(r.privateKey || '')
      onStatusChange(`已生成 RSA-${rsaBits} 密钥对`)
    } catch (err: any) { message.error('生成失败: ' + err.message) }
    finally { setRsaLoading(false) }
  }

  // ── Number conversion handlers ──

  const syncNumFrom = (value: string, base: 'dec' | 'hex' | 'oct' | 'bin') => {
    try {
      let n: bigint
      const clean = value.trim()
      if (!clean) { setNumDecimal(''); setNumHex(''); setNumOctal(''); setNumBinary(''); return }
      if (base === 'dec') n = BigInt(clean)
      else if (base === 'hex') n = BigInt('0x' + clean.replace(/^0x/i, ''))
      else if (base === 'oct') n = BigInt('0o' + clean.replace(/^0o/i, ''))
      else n = BigInt('0b' + clean.replace(/^0b/i, ''))
      const isNeg = n < 0n
      const abs = isNeg ? -n : n
      if (base !== 'dec') setNumDecimal((isNeg ? '-' : '') + abs.toString(10))
      if (base !== 'hex') setNumHex((isNeg ? '-' : '') + abs.toString(16).toUpperCase())
      if (base !== 'oct') setNumOctal((isNeg ? '-' : '') + abs.toString(8))
      if (base !== 'bin') setNumBinary((isNeg ? '-' : '') + abs.toString(2))
    } catch {
      if (base !== 'dec') setNumDecimal('')
      if (base !== 'hex') setNumHex('')
      if (base !== 'oct') setNumOctal('')
      if (base !== 'bin') setNumBinary('')
    }
  }

  // ── Obfuscation handlers ──

  const obfuscateOps = [
    {
      label: 'Unicode 转义',
      encode: (s: string) => Array.from(s).map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''),
      decode: (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    },
    {
      label: 'HTML 实体',
      encode: (s: string) => Array.from(s).map((c) => '&#' + c.charCodeAt(0) + ';').join(''),
      decode: (s: string) => s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
    },
    {
      label: 'CharCode 数组',
      encode: (s: string) => '[' + Array.from(s).map((c) => c.charCodeAt(0)).join(',') + ']',
      decode: (s: string) => {
        const nums = s.replace(/[\[\]\s]/g, '').split(',').filter(Boolean)
        return nums.map((n) => String.fromCharCode(parseInt(n))).join('')
      },
    },
    {
      label: 'ROT13',
      encode: (s: string) => s.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
      }),
      decode: (s: string) => s.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
      }),
    },
    {
      label: '字符串反转',
      encode: (s: string) => Array.from(s).reverse().join(''),
      decode: (s: string) => Array.from(s).reverse().join(''),
    },
    {
      label: 'Hex 字符串',
      encode: (s: string) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join(''),
      decode: (s: string) => {
        const clean = s.replace(/\s+/g, '')
        const bytes = new Uint8Array(clean.length / 2)
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
        return new TextDecoder().decode(bytes)
      },
    },
  ]

  const INPUT_ENC_OPTIONS = [
    { label: 'UTF-8', value: 'utf-8' },
    { label: 'Hex', value: 'hex' },
    { label: 'Base64', value: 'base64' },
  ]

  // ── Render panels ──

  const renderCodec = () => (
    <div className="enc-panel enc-panel-fill">
      <div className="enc-panel-header">
        <span>编解码</span>
        <Space size={10}>
          <Tooltip title="导出二进制文件">
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExportBinary} disabled={!lastBytes}>导出</Button>
          </Tooltip>
          <Button size="small" icon={<ClearOutlined />} onClick={clearEncoding}>清空</Button>
        </Space>
      </div>
      <div className="enc-codec-grid">
        <div className="enc-codec-cell">
          <div className="enc-codec-label">
            <span>Base64</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(base64Text)} /></Tooltip>
          </div>
          <TextArea value={base64Text} onChange={(e) => handleBase64Change(e.target.value)} placeholder="Base64..." style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none', minHeight: 120 }} />
        </div>
        <div className="enc-codec-cell">
          <div className="enc-codec-label">
            <span>Hex</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(hexText)} /></Tooltip>
          </div>
          <TextArea value={hexText} onChange={(e) => handleHexChange(e.target.value)} placeholder="十六进制..." style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none', minHeight: 120 }} />
        </div>
        <div className="enc-codec-cell">
          <div className="enc-codec-label">
            <span>UTF-8 文本</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(plainText)} /></Tooltip>
          </div>
          <TextArea value={plainText} onChange={(e) => handlePlainTextChange(e.target.value)} placeholder="UTF-8 文本..." style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none', minHeight: 120 }} />
        </div>
      </div>
      <div className="enc-url-row">
        <span className="enc-option-label" style={{ flexShrink: 0 }}>URL</span>
        <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="输入 URL 编解码内容..." style={{ flex: 1, fontFamily: 'Consolas, monospace' }} />
        <Button onClick={handleUrlEncode}>编码</Button>
        <Button onClick={handleUrlDecode}>解码</Button>
      </div>
      {urlOutput && (
        <div className="enc-url-row">
          <span className="enc-option-label" style={{ flexShrink: 0 }}>结果</span>
          <Input value={urlOutput} readOnly style={{ flex: 1, fontFamily: 'Consolas, monospace' }} />
          <Tooltip title="复制"><Button icon={<CopyOutlined />} onClick={() => copyText(urlOutput)} /></Tooltip>
        </div>
      )}
    </div>
  )

  const renderHash = () => (
    <div className="enc-panel">
      <div className="enc-panel-header">哈希计算</div>
      <div className="enc-hash-input-row">
        <TextArea value={hashInput} onChange={(e) => setHashInput(e.target.value)} placeholder="输入待哈希的数据..." rows={5} style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none' }} />
        <div className="enc-hash-controls">
          <div className="enc-option-row">
            <span className="enc-option-label">输入格式</span>
            <Select size="small" value={hashInputEnc} onChange={setHashInputEnc} options={INPUT_ENC_OPTIONS} style={{ width: 100 }} />
          </div>
          <div className="enc-option-row">
            <span className="enc-option-label">HMAC</span>
            <Switch size="small" checked={hmacEnabled} onChange={setHmacEnabled} />
          </div>
          {hmacEnabled && (
            <>
              <Input size="small" value={hmacKey} onChange={(e) => setHmacKey(e.target.value)} placeholder="HMAC Key..." style={{ fontFamily: 'Consolas, monospace' }} />
              <Select size="small" value={hmacKeyEnc} onChange={setHmacKeyEnc} options={INPUT_ENC_OPTIONS} style={{ width: 100 }} />
            </>
          )}
          <Button type="primary" size="small" icon={<ThunderboltOutlined />} onClick={handleHashCompute}>计算</Button>
        </div>
      </div>
      {hashResults.length > 0 && (
        <div className="enc-hash-results">
          {hashResults.map((r) => (
            <div key={r.label} className="enc-hash-result-row">
              <span className="enc-hash-result-label">{r.label}</span>
              <span className="enc-hash-result-value">{r.value}</span>
              <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(r.value)} /></Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderAes = () => (
    <div className="enc-panel">
      <div className="enc-panel-header">AES 加解密</div>
      <div className="enc-aes-row">
        <div className="enc-aes-left">
          <div className="enc-option-row">
            <span className="enc-option-label">模式</span>
            <Select size="small" value={aesMode} onChange={setAesMode} style={{ width: 90 }} options={[
              { label: 'CBC', value: 'cbc' },
              { label: 'ECB', value: 'ecb' },
            ]} />
            <span className="enc-option-label">输入格式</span>
            <Select size="small" value={aesInputEnc} onChange={setAesInputEnc} options={INPUT_ENC_OPTIONS} style={{ width: 100 }} />
          </div>
          <Input value={aesKey} onChange={(e) => setAesKey(e.target.value)} placeholder="Key (Hex)  例: 0123456789ABCDEF0123456789ABCDEF" addonBefore="Key" style={{ fontFamily: 'Consolas, monospace' }} />
          {aesMode === 'cbc' && (
            <Input value={aesIv} onChange={(e) => setAesIv(e.target.value)} placeholder="IV (Hex)  例: 00000000000000000000000000000000" addonBefore="IV" style={{ fontFamily: 'Consolas, monospace' }} />
          )}
          <TextArea value={aesInput} onChange={(e) => setAesInput(e.target.value)} placeholder="输入明文或密文..." rows={6} style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
          <Space size={10} style={{ marginTop: 4 }}>
            <Button type="primary" icon={<LockOutlined />} onClick={handleAesEncrypt}>加密</Button>
            <Button icon={<UnlockOutlined />} onClick={handleAesDecrypt}>解密</Button>
          </Space>
        </div>
        <div className="enc-aes-right">
          <div className="enc-codec-label">
            <span>{aesOutputLabel[0]}</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(aesOutputHex)} /></Tooltip>
          </div>
          <TextArea value={aesOutputHex} readOnly rows={5} placeholder="结果..." style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
          <div className="enc-codec-label" style={{ marginTop: 10 }}>
            <span>{aesOutputLabel[1]}</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(aesOutputExtra)} /></Tooltip>
          </div>
          <TextArea value={aesOutputExtra} readOnly rows={5} placeholder="结果..." style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
        </div>
      </div>
    </div>
  )

  const renderRsa = () => (
    <div className="enc-panel">
      <div className="enc-panel-header">RSA 加解密</div>
      <div className="enc-aes-row">
        <div className="enc-aes-left">
          <div className="enc-option-row">
            <span className="enc-option-label">填充</span>
            <Select size="small" value={rsaPadding} onChange={setRsaPadding} style={{ width: 130 }} options={[
              { label: 'OAEP (SHA-256)', value: 'oaep' },
              { label: 'PKCS1 v1.5', value: 'pkcs1' },
            ]} />
            <span className="enc-option-label">输入格式</span>
            <Select size="small" value={rsaInputEnc} onChange={setRsaInputEnc} options={INPUT_ENC_OPTIONS} style={{ width: 100 }} />
          </div>
          <TextArea value={rsaKeyPem} onChange={(e) => setRsaKeyPem(e.target.value)} placeholder={'粘贴 PEM 公钥（加密）或私钥（解密）...\n-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'} rows={6} style={{ fontFamily: 'Consolas, monospace', resize: 'none', fontSize: 11 }} />
          <TextArea value={rsaInput} onChange={(e) => setRsaInput(e.target.value)} placeholder="输入明文（加密）或密文（解密）..." rows={5} style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
          <Space size={10} style={{ marginTop: 4 }}>
            <Button type="primary" icon={<LockOutlined />} onClick={handleRsaEncrypt}>公钥加密</Button>
            <Button icon={<UnlockOutlined />} onClick={handleRsaDecrypt}>私钥解密</Button>
          </Space>
        </div>
        <div className="enc-aes-right">
          <div className="enc-codec-label">
            <span>{rsaOutputLabel[0]}</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(rsaOutputHex)} /></Tooltip>
          </div>
          <TextArea value={rsaOutputHex} readOnly rows={6} placeholder="结果..." style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
          <div className="enc-codec-label" style={{ marginTop: 10 }}>
            <span>{rsaOutputLabel[1]}</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(rsaOutputExtra)} /></Tooltip>
          </div>
          <TextArea value={rsaOutputExtra} readOnly rows={6} placeholder="结果..." style={{ fontFamily: 'Consolas, monospace', resize: 'none' }} />
        </div>
      </div>
    </div>
  )

  const renderKeygen = () => (
    <div className="enc-panel">
      <div className="enc-panel-header">密钥 / 随机数生成</div>
      <div className="enc-keygen-grid">
        <div className="enc-keygen-card">
          <div className="enc-keygen-card-title">随机字节</div>
          <div className="enc-option-row">
            <span className="enc-option-label">长度</span>
            <Select size="small" value={randomLen} onChange={setRandomLen} style={{ width: 80 }} options={[
              { label: '8', value: 8 }, { label: '16', value: 16 }, { label: '24', value: 24 }, { label: '32', value: 32 }, { label: '64', value: 64 },
            ]} />
            <span className="enc-option-hint">字节</span>
            <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={handleGenRandom}>生成</Button>
          </div>
          {randomHex && (
            <div className="enc-keygen-output">
              <div className="enc-keygen-output-row"><span className="enc-keygen-output-label">Hex</span><span className="enc-keygen-output-value">{randomHex}</span><CopyOutlined className="enc-copy-icon" onClick={() => copyText(randomHex)} /></div>
              <div className="enc-keygen-output-row"><span className="enc-keygen-output-label">Base64</span><span className="enc-keygen-output-value">{randomBase64}</span><CopyOutlined className="enc-copy-icon" onClick={() => copyText(randomBase64)} /></div>
            </div>
          )}
        </div>
        <div className="enc-keygen-card">
          <div className="enc-keygen-card-title">AES 密钥</div>
          <div className="enc-option-row">
            <Select size="small" value={aesKeyBits} onChange={setAesKeyBits} style={{ width: 80 }} options={[
              { label: '128', value: 128 }, { label: '192', value: 192 }, { label: '256', value: 256 },
            ]} />
            <span className="enc-option-hint">bit</span>
            <Button size="small" type="primary" icon={<KeyOutlined />} onClick={handleGenAesKey}>生成</Button>
          </div>
          {aesKeyHex && (
            <div className="enc-keygen-output">
              <div className="enc-keygen-output-row"><span className="enc-keygen-output-label">Hex</span><span className="enc-keygen-output-value">{aesKeyHex}</span><CopyOutlined className="enc-copy-icon" onClick={() => copyText(aesKeyHex)} /></div>
            </div>
          )}
        </div>
        <div className="enc-keygen-card enc-keygen-card-wide">
          <div className="enc-keygen-card-title">RSA 密钥对</div>
          <div className="enc-option-row">
            <Select size="small" value={rsaBits} onChange={setRsaBits} style={{ width: 80 }} options={[
              { label: '2048', value: 2048 }, { label: '4096', value: 4096 },
            ]} />
            <span className="enc-option-hint">bit</span>
            <Button size="small" type="primary" icon={<KeyOutlined />} onClick={handleGenRsa} loading={rsaLoading}>生成</Button>
          </div>
          {rsaPublicKey && (
            <div className="enc-rsa-output">
              <div className="enc-rsa-pem">
                <div className="enc-codec-label"><span>公钥 (PEM)</span><CopyOutlined className="enc-copy-icon" onClick={() => copyText(rsaPublicKey)} /></div>
                <TextArea value={rsaPublicKey} readOnly rows={6} style={{ fontFamily: 'Consolas, monospace', fontSize: 11, resize: 'none' }} />
              </div>
              <div className="enc-rsa-pem">
                <div className="enc-codec-label"><span>私钥 (PEM)</span><CopyOutlined className="enc-copy-icon" onClick={() => copyText(rsaPrivateKey)} /></div>
                <TextArea value={rsaPrivateKey} readOnly rows={6} style={{ fontFamily: 'Consolas, monospace', fontSize: 11, resize: 'none' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderNumConv = () => (
    <div className="enc-panel">
      <div className="enc-panel-header">数值转换</div>
      <div className="enc-numconv-grid">
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">十进制 (Long)</span>
          <Input
            value={numDecimal}
            onChange={(e) => { setNumDecimal(e.target.value); syncNumFrom(e.target.value, 'dec') }}
            placeholder="输入十进制数字..."
            style={{ fontFamily: 'Consolas, monospace' }}
            addonAfter={<CopyOutlined onClick={() => copyText(numDecimal)} style={{ cursor: 'pointer' }} />}
          />
        </div>
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">十六进制 (Hex)</span>
          <Input
            value={numHex}
            onChange={(e) => { setNumHex(e.target.value); syncNumFrom(e.target.value, 'hex') }}
            placeholder="输入十六进制..."
            style={{ fontFamily: 'Consolas, monospace' }}
            addonAfter={<CopyOutlined onClick={() => copyText(numHex)} style={{ cursor: 'pointer' }} />}
          />
        </div>
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">八进制 (Octal)</span>
          <Input
            value={numOctal}
            onChange={(e) => { setNumOctal(e.target.value); syncNumFrom(e.target.value, 'oct') }}
            placeholder="输入八进制..."
            style={{ fontFamily: 'Consolas, monospace' }}
            addonAfter={<CopyOutlined onClick={() => copyText(numOctal)} style={{ cursor: 'pointer' }} />}
          />
        </div>
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">二进制 (Binary)</span>
          <Input
            value={numBinary}
            onChange={(e) => { setNumBinary(e.target.value); syncNumFrom(e.target.value, 'bin') }}
            placeholder="输入二进制..."
            style={{ fontFamily: 'Consolas, monospace' }}
            addonAfter={<CopyOutlined onClick={() => copyText(numBinary)} style={{ cursor: 'pointer' }} />}
          />
        </div>
      </div>

      <div className="enc-panel-header" style={{ marginTop: 20 }}>Hex 字节 ↔ Long (大端序)</div>
      <div className="enc-numconv-grid">
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">Hex 字节</span>
          <Input
            placeholder="如 00 00 01 A4 或 000001A4"
            style={{ fontFamily: 'Consolas, monospace' }}
            onChange={(e) => {
              const hex = e.target.value.replace(/[\s:.-]/g, '')
              if (!hex || !/^[0-9a-fA-F]*$/.test(hex)) return
              try {
                const n = BigInt('0x' + hex)
                setNumDecimal(n.toString(10))
                setNumHex(hex.toUpperCase())
                setNumOctal(n.toString(8))
                setNumBinary(n.toString(2))
              } catch { /* ignore */ }
            }}
            addonBefore="→"
          />
        </div>
        <div className="enc-numconv-row">
          <span className="enc-numconv-label">Long → Hex 字节</span>
          <Input
            placeholder="输入十进制数字"
            style={{ fontFamily: 'Consolas, monospace' }}
            onChange={(e) => {
              const val = e.target.value.trim()
              if (!val) return
              try {
                const n = BigInt(val)
                let hex = n.toString(16).toUpperCase()
                if (hex.length % 2 !== 0) hex = '0' + hex
                const spaced = hex.match(/.{1,2}/g)?.join(' ') || hex
                setNumDecimal(n.toString(10))
                setNumHex(hex)
                setNumOctal(n.toString(8))
                setNumBinary(n.toString(2))
                onStatusChange(`${val} → ${spaced}`)
              } catch { /* ignore */ }
            }}
            addonBefore="→"
          />
        </div>
      </div>
    </div>
  )

  const renderObfuscate = () => (
    <div className="enc-panel enc-panel-fill">
      <div className="enc-panel-header">
        <span>数据混淆 / 编码转换</span>
        <Button size="small" icon={<ClearOutlined />} onClick={() => { setObfInput(''); setObfOutput('') }}>清空</Button>
      </div>
      <div className="enc-obf-layout">
        <div className="enc-obf-input-col">
          <div className="enc-codec-label">
            <span>输入</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(obfInput)} /></Tooltip>
          </div>
          <TextArea
            value={obfInput}
            onChange={(e) => setObfInput(e.target.value)}
            placeholder="输入要混淆/编码的文本..."
            style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none', minHeight: 150 }}
          />
        </div>
        <div className="enc-obf-btn-col">
          {obfuscateOps.map((op) => (
            <div key={op.label} className="enc-obf-btn-pair">
              <Tooltip title={`${op.label} 编码`}>
                <Button
                  size="small"
                  onClick={() => { setObfOutput(op.encode(obfInput)); onStatusChange(`${op.label} 编码完成`) }}
                >
                  {op.label} →
                </Button>
              </Tooltip>
              <Tooltip title={`${op.label} 解码`}>
                <Button
                  size="small"
                  onClick={() => {
                    try {
                      setObfOutput(op.decode(obfInput))
                      onStatusChange(`${op.label} 解码完成`)
                    } catch { message.error(`${op.label} 解码失败`) }
                  }}
                >
                  ← 还原
                </Button>
              </Tooltip>
            </div>
          ))}
          <div className="enc-obf-btn-pair" style={{ marginTop: 8 }}>
            <Button size="small" type="dashed" onClick={() => setObfInput(obfOutput)}>
              结果 → 输入
            </Button>
          </div>
        </div>
        <div className="enc-obf-input-col">
          <div className="enc-codec-label">
            <span>结果</span>
            <Tooltip title="复制"><CopyOutlined className="enc-copy-icon" onClick={() => copyText(obfOutput)} /></Tooltip>
          </div>
          <TextArea
            value={obfOutput}
            readOnly
            style={{ flex: 1, fontFamily: 'Consolas, monospace', resize: 'none', minHeight: 150 }}
            placeholder="编码/混淆结果..."
          />
        </div>
      </div>
    </div>
  )

  const PANELS: Record<TabKey, () => React.ReactNode> = {
    codec: renderCodec,
    hash: renderHash,
    numconv: renderNumConv,
    obfuscate: renderObfuscate,
    aes: renderAes,
    rsa: renderRsa,
    keygen: renderKeygen,
  }

  return (
    <div className="enc-page">
      <nav className="enc-sidebar">
        {SIDEBAR_ITEMS.map((item) => (
          <div
            key={item.key}
            className={`enc-sidebar-item${activeTab === item.key ? ' enc-sidebar-item-active' : ''}`}
            onClick={() => setActiveTab(item.key)}
          >
            <span className="enc-sidebar-icon">{item.icon}</span>
            <span className="enc-sidebar-label">{item.label}</span>
          </div>
        ))}
      </nav>
      <div className="enc-content">
        {PANELS[activeTab]()}
      </div>
    </div>
  )
}
