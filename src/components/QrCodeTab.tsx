import { useState, useCallback, useMemo, DragEvent } from 'react'
import { Button, Input, Space, message, Select, Slider, Tooltip, ColorPicker } from 'antd'
import {
  QrcodeOutlined, CopyOutlined, DownloadOutlined, UploadOutlined,
  ScanOutlined, ClearOutlined, SnippetsOutlined, SendOutlined,
  ThunderboltOutlined, FileImageOutlined,
} from '@ant-design/icons'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

const { TextArea } = Input

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

interface Props {
  onStatusChange: (s: string) => void
}

interface BatchItem {
  text: string
  url: string
}

export default function QrCodeTab({ onStatusChange }: Props) {
  const [genText, setGenText] = useState('')
  const [qrImageUrl, setQrImageUrl] = useState('')
  const [errorLevel, setErrorLevel] = useState<ErrorCorrectionLevel>('M')
  const [qrSize, setQrSize] = useState(256)
  const [fgColor, setFgColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('#ffffff')

  const [recognizeResult, setRecognizeResult] = useState('')
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [batchInput, setBatchInput] = useState('')
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])

  const textStats = useMemo(() => {
    const chars = genText.length
    const bytes = new TextEncoder().encode(genText).length
    return { chars, bytes }
  }, [genText])

  // ── Generation ─────────────────────────────────

  const handleGenerate = async () => {
    if (!genText.trim()) {
      message.warning('请输入要生成二维码的文本')
      return
    }
    try {
      const url = await QRCode.toDataURL(genText.trim(), {
        width: qrSize,
        margin: 2,
        errorCorrectionLevel: errorLevel,
        color: { dark: fgColor, light: bgColor },
      })
      setQrImageUrl(url)
      onStatusChange('二维码生成成功')
    } catch (err: any) {
      message.error('生成失败: ' + err.message)
    }
  }

  const handleSavePNG = async () => {
    if (!qrImageUrl) return
    try {
      const base64Data = qrImageUrl.split(',')[1]
      const binary = atob(base64Data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ok = await window.electronAPI.saveFile(Array.from(bytes), 'qrcode.png')
      if (ok) message.success('保存成功')
    } catch (err: any) {
      message.error('保存失败: ' + err.message)
    }
  }

  const handleSaveSVG = async () => {
    if (!genText.trim()) return
    try {
      const svg = await QRCode.toString(genText.trim(), {
        type: 'svg',
        width: qrSize,
        margin: 2,
        errorCorrectionLevel: errorLevel,
        color: { dark: fgColor, light: bgColor },
      })
      const bytes = new TextEncoder().encode(svg)
      const ok = await window.electronAPI.saveFile(Array.from(bytes), 'qrcode.svg')
      if (ok) message.success('SVG 保存成功')
    } catch (err: any) {
      message.error('保存失败: ' + err.message)
    }
  }

  const handleCopyQR = async () => {
    if (!qrImageUrl) return
    try {
      const resp = await fetch(qrImageUrl)
      const blob = await resp.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      message.success('已复制二维码图片')
    } catch {
      message.warning('复制图片失败')
    }
  }

  const handlePasteText = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setGenText(text)
        onStatusChange('已粘贴文本')
      } else {
        message.warning('剪贴板中没有文本')
      }
    } catch {
      message.warning('无法读取剪贴板')
    }
  }

  const handleClearGen = () => {
    setGenText('')
    setQrImageUrl('')
    onStatusChange('已清空')
  }

  // ── Recognition ────────────────────────────────

  const recognizeFromDataUrl = useCallback((url: string) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, canvas.width, canvas.height)
      if (code) {
        setRecognizeResult(code.data)
        onStatusChange('二维码识别成功')
      } else {
        setRecognizeResult('未能识别到二维码')
        onStatusChange('未在图片中发现二维码')
      }
    }
    img.onerror = () => message.error('图片加载失败')
    img.src = url
  }, [onStatusChange])

  const handleUploadImage = async () => {
    try {
      const filePath = await window.electronAPI.selectFile([
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] },
      ])
      if (!filePath) return
      const base64 = await window.electronAPI.readFileAsBase64(filePath)
      const dataUrl = `data:image/png;base64,${base64}`
      setUploadedImageUrl(dataUrl)
      recognizeFromDataUrl(dataUrl)
    } catch (err: any) {
      message.error('加载图片失败: ' + err.message)
    }
  }

  const handlePasteImage = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            const url = URL.createObjectURL(blob)
            setUploadedImageUrl(url)
            recognizeFromDataUrl(url)
            return
          }
        }
      }
      message.warning('剪贴板中没有图片')
    } catch {
      message.warning('无法读取剪贴板')
    }
  }, [recognizeFromDataUrl])

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.warning('请拖入图片文件')
      return
    }
    const url = URL.createObjectURL(file)
    setUploadedImageUrl(url)
    recognizeFromDataUrl(url)
  }

  const handleClearRecognize = () => {
    setUploadedImageUrl('')
    setRecognizeResult('')
    onStatusChange('已清空识别结果')
  }

  const handleSendToGenerate = () => {
    if (!recognizeResult || recognizeResult === '未能识别到二维码') return
    setGenText(recognizeResult)
    onStatusChange('已将识别结果填入生成区')
  }

  // ── Batch ──────────────────────────────────────

  const handleBatchGenerate = async () => {
    const lines = batchInput.split('\n').filter((l) => l.trim())
    if (lines.length === 0) {
      message.warning('请输入文本（每行一个）')
      return
    }
    if (lines.length > 50) {
      message.warning('批量生成最多支持 50 条')
      return
    }
    try {
      const items: BatchItem[] = []
      for (const line of lines) {
        const text = line.trim()
        const url = await QRCode.toDataURL(text, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: errorLevel,
          color: { dark: fgColor, light: bgColor },
        })
        items.push({ text, url })
      }
      setBatchItems(items)
      onStatusChange(`批量生成完成: ${items.length} 个二维码`)
    } catch (err: any) {
      message.error('批量生成失败: ' + err.message)
    }
  }

  const handleSaveBatchItem = async (item: BatchItem, index: number) => {
    try {
      const base64Data = item.url.split(',')[1]
      const binary = atob(base64Data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ok = await window.electronAPI.saveFile(Array.from(bytes), `qrcode-${index + 1}.png`)
      if (ok) message.success('保存成功')
    } catch (err: any) {
      message.error('保存失败: ' + err.message)
    }
  }

  const hasValidResult = recognizeResult && recognizeResult !== '未能识别到二维码'

  return (
    <div className="qr-page">
      <div className="qr-body">
        {/* ── Generate ── */}
        <div className="qr-section">
          <div className="qr-section-title">生成二维码</div>
          <div className="qr-gen-row">
            <div className="qr-gen-left">
              <TextArea
                value={genText}
                onChange={(e) => setGenText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    handleGenerate()
                  }
                }}
                placeholder="输入文本内容，Ctrl+Enter 快速生成..."
                rows={4}
                style={{ fontFamily: 'Consolas, monospace' }}
              />
              <div className="qr-text-stats">
                {genText ? `${textStats.chars} 字符 / ${textStats.bytes} 字节` : '\u00A0'}
              </div>

              <div className="qr-options">
                <div className="qr-option-item">
                  <span className="qr-option-label">纠错</span>
                  <Select
                    size="small"
                    value={errorLevel}
                    onChange={setErrorLevel}
                    style={{ width: 80 }}
                    options={[
                      { label: 'L (7%)', value: 'L' },
                      { label: 'M (15%)', value: 'M' },
                      { label: 'Q (25%)', value: 'Q' },
                      { label: 'H (30%)', value: 'H' },
                    ]}
                  />
                </div>
                <div className="qr-option-item">
                  <span className="qr-option-label">尺寸</span>
                  <Slider
                    min={128}
                    max={512}
                    step={32}
                    value={qrSize}
                    onChange={setQrSize}
                    style={{ width: 100, margin: '0 4px' }}
                  />
                  <span className="qr-option-value">{qrSize}px</span>
                </div>
                <div className="qr-option-item">
                  <span className="qr-option-label">前景</span>
                  <ColorPicker size="small" value={fgColor} onChange={(_, hex) => setFgColor(hex)} />
                </div>
                <div className="qr-option-item">
                  <span className="qr-option-label">背景</span>
                  <ColorPicker size="small" value={bgColor} onChange={(_, hex) => setBgColor(hex)} />
                </div>
              </div>

              <Space size={6} style={{ marginTop: 10 }}>
                <Button type="primary" icon={<QrcodeOutlined />} onClick={handleGenerate}>生成</Button>
                <Tooltip title="粘贴剪贴板文本">
                  <Button icon={<SnippetsOutlined />} onClick={handlePasteText}>粘贴文本</Button>
                </Tooltip>
                <Button icon={<ClearOutlined />} onClick={handleClearGen} disabled={!genText && !qrImageUrl}>清空</Button>
              </Space>
            </div>

            <div className="qr-gen-right">
              {qrImageUrl ? (
                <>
                  <div className="qr-preview">
                    <img src={qrImageUrl} alt="QR Code" />
                  </div>
                  <Space size={6} style={{ marginTop: 8 }}>
                    <Tooltip title="保存 PNG"><Button size="small" icon={<DownloadOutlined />} onClick={handleSavePNG}>PNG</Button></Tooltip>
                    <Tooltip title="保存 SVG"><Button size="small" icon={<FileImageOutlined />} onClick={handleSaveSVG}>SVG</Button></Tooltip>
                    <Tooltip title="复制到剪贴板"><Button size="small" icon={<CopyOutlined />} onClick={handleCopyQR}>复制</Button></Tooltip>
                  </Space>
                </>
              ) : (
                <div className="qr-preview-empty">
                  <QrcodeOutlined style={{ fontSize: 48, opacity: 0.15 }} />
                  <span>二维码预览</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Recognize ── */}
        <div className="qr-section">
          <div className="qr-section-title">识别二维码</div>
          <div className="qr-recognize-row">
            <div className="qr-recognize-left">
              <div
                className={`qr-drop-zone${dragOver ? ' qr-drop-zone-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {uploadedImageUrl ? (
                  <img src={uploadedImageUrl} alt="Uploaded" className="qr-drop-zone-img" />
                ) : (
                  <div className="qr-drop-zone-placeholder">
                    <UploadOutlined style={{ fontSize: 32, opacity: 0.3 }} />
                    <span>拖拽图片到此处</span>
                  </div>
                )}
              </div>
              <Space size={6} style={{ marginTop: 8 }}>
                <Button size="small" icon={<UploadOutlined />} onClick={handleUploadImage}>上传</Button>
                <Button size="small" icon={<ScanOutlined />} onClick={handlePasteImage}>粘贴</Button>
                <Button size="small" icon={<ClearOutlined />} onClick={handleClearRecognize} disabled={!uploadedImageUrl && !recognizeResult}>清空</Button>
              </Space>
            </div>

            <div className="qr-recognize-right">
              <div className="qr-recognize-label">识别结果</div>
              <TextArea
                value={recognizeResult}
                readOnly
                rows={5}
                placeholder="识别结果将显示在这里..."
                style={{ fontFamily: 'Consolas, monospace' }}
              />
              <Space size={6} style={{ marginTop: 8 }}>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(recognizeResult)
                    message.success('已复制')
                  }}
                  disabled={!recognizeResult}
                >
                  复制结果
                </Button>
                <Tooltip title="将识别结果填入生成区">
                  <Button
                    size="small"
                    icon={<SendOutlined />}
                    onClick={handleSendToGenerate}
                    disabled={!hasValidResult}
                  >
                    转到生成
                  </Button>
                </Tooltip>
              </Space>
            </div>
          </div>
        </div>

        {/* ── Batch ── */}
        <div className="qr-section">
          <div className="qr-section-title">
            <span>批量生成</span>
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={handleBatchGenerate}>
              生成
            </Button>
          </div>
          <div className="qr-batch-row">
            <TextArea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder={'每行一段文本，最多 50 条，例如:\nhttps://example.com\nhttps://example.org'}
              rows={5}
              style={{ flex: '0 0 260px', resize: 'none', fontFamily: 'Consolas, monospace' }}
            />
            <div className="qr-batch-grid">
              {batchItems.length > 0 ? (
                batchItems.map((item, i) => (
                  <Tooltip key={i} title={`${item.text}\n(点击保存)`}>
                    <div className="qr-batch-item" onClick={() => handleSaveBatchItem(item, i)}>
                      <img src={item.url} alt={`QR ${i + 1}`} />
                      <span className="qr-batch-item-label">
                        {item.text.length > 16 ? item.text.substring(0, 16) + '…' : item.text}
                      </span>
                    </div>
                  </Tooltip>
                ))
              ) : (
                <div className="qr-batch-empty">
                  批量生成的二维码将显示在这里<br />点击单个二维码可保存
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
