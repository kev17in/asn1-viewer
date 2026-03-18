import { useState, useCallback } from 'react'
import { Input, Button, Space, Tooltip, Tag, Empty, message, Collapse, Badge } from 'antd'
import {
  SafetyCertificateOutlined, CopyOutlined, ClearOutlined,
  UploadOutlined, ThunderboltOutlined, LinkOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

interface Props {
  onStatusChange: (s: string) => void
}

interface CertInfo {
  subject?: string
  issuer?: string
  serialNumber?: string
  validFrom?: string
  validTo?: string
  validDays?: number
  fingerprint?: string
  fingerprint256?: string
  fingerprint512?: string
  publicKey?: { algorithm?: string; size?: number }
  publicKeyHex?: string
  publicKeyPinSha256?: string
  sigAlg?: string
  subjectAltName?: string
  keyUsage?: string[]
  infoAccess?: string
  raw?: string
  ca?: boolean
  opensslText?: string
  error?: string
}

const DN_LABELS: Record<string, string> = {
  CN: '通用名称(CN)',
  O: '组织(O)',
  OU: '部门(OU)',
  L: '城市(L)',
  ST: '省份(ST)',
  C: '国家(C)',
  emailAddress: '邮箱',
  serialNumber: '序列号',
}

function parseDN(dn: string): Array<{ key: string; label: string; value: string }> {
  if (!dn) return []
  return dn.split('\n').map((line) => {
    const idx = line.indexOf('=')
    if (idx < 0) return { key: line.trim(), label: line.trim(), value: '' }
    const key = line.slice(0, idx).trim()
    return { key, label: DN_LABELS[key] || key, value: line.slice(idx + 1).trim() }
  }).filter((e) => e.key)
}

function getCN(dn: string): string {
  const entries = parseDN(dn)
  const cn = entries.find((e) => e.key === 'CN')
  return cn?.value || dn.split('\n')[0] || '(unknown)'
}

function isExpired(validTo: string): boolean {
  return new Date(validTo).getTime() < Date.now()
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return dateStr
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

function InfoRow({ label, value, mono, copyable }: {
  label: string
  value: React.ReactNode
  mono?: boolean
  copyable?: string
}) {
  return (
    <div className="cert-info-row">
      <div className="cert-info-label">{label}</div>
      <div className={`cert-info-value ${mono ? 'mono' : ''}`}>
        {value}
        {copyable && (
          <Tooltip title="复制">
            <Button type="text" size="small" className="cert-copy-btn" icon={<CopyOutlined />} onClick={() => copyText(copyable)} />
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function CertDetail({ cert, onSendToAsn1 }: { cert: CertInfo; onSendToAsn1: (raw: string) => void }) {
  const [showOpenssl, setShowOpenssl] = useState(false)

  if (cert.error) {
    return (
      <div style={{ padding: 12, color: '#ff4d4f' }}>
        解析失败: {cert.error}
      </div>
    )
  }

  const expired = cert.validTo ? isExpired(cert.validTo) : false
  const subjectEntries = parseDN(cert.subject || '')
  const issuerEntries = parseDN(cert.issuer || '')

  return (
    <div className="cert-detail">
      {/* 主题信息 */}
      <div className="cert-section">
        <div className="cert-section-title">主题信息</div>
        <div className="cert-info-table">
          {subjectEntries.map((e, i) => (
            <InfoRow key={`s-${i}`} label={e.label} value={e.value} />
          ))}
        </div>
      </div>

      {/* 颁发者信息 */}
      <div className="cert-section">
        <div className="cert-section-title">颁发者信息</div>
        <div className="cert-info-table">
          {issuerEntries.map((e, i) => (
            <InfoRow key={`i-${i}`} label={e.label} value={e.value} />
          ))}
        </div>
      </div>

      {/* 证书信息 */}
      <div className="cert-section">
        <div className="cert-section-title">证书信息</div>
        <div className="cert-info-table">
          <InfoRow label="序列号" value={cert.serialNumber} mono copyable={cert.serialNumber} />
          <InfoRow label="根证书" value={cert.ca ? '是' : '否'} />
          <InfoRow label="算法" value={cert.sigAlg || '-'} />
          <InfoRow label="私钥长度" value={cert.publicKey?.size ? `${cert.publicKey.size} Bits` : '-'} />
          <InfoRow
            label="SHA1指纹"
            value={cert.fingerprint?.replace(/:/g, '')}
            mono
            copyable={cert.fingerprint?.replace(/:/g, '')}
          />
          <InfoRow
            label="SHA256指纹"
            value={cert.fingerprint256?.replace(/:/g, '')}
            mono
            copyable={cert.fingerprint256?.replace(/:/g, '')}
          />
          {cert.publicKeyPinSha256 && (
            <InfoRow
              label="公钥PIN-SHA256"
              value={cert.publicKeyPinSha256}
              mono
              copyable={cert.publicKeyPinSha256}
            />
          )}
          <InfoRow label="颁发日期" value={formatDate(cert.validFrom || '')} />
          <InfoRow
            label="截止日期"
            value={
              <span>
                {formatDate(cert.validTo || '')}
                {expired && <Tag color="red" style={{ marginLeft: 6 }}>已过期</Tag>}
              </span>
            }
          />
          <InfoRow
            label="有效期"
            value={
              <span>
                {cert.validDays != null ? `${cert.validDays}天` : '-'}
                {!expired && cert.validTo && (
                  <Tag color="green" style={{ marginLeft: 6 }}>有效</Tag>
                )}
              </span>
            }
          />
          {cert.keyUsage && cert.keyUsage.length > 0 && (
            <InfoRow label="密钥用法" value={cert.keyUsage.join(', ')} />
          )}
          {cert.subjectAltName && (
            <InfoRow label="SAN" value={cert.subjectAltName} mono />
          )}
          {cert.publicKeyHex && (
            <InfoRow label="公钥" value={
              <span className="cert-pubkey-hex">{cert.publicKeyHex}</span>
            } copyable={cert.publicKeyHex} />
          )}
        </div>
      </div>

      {/* OpenSSL */}
      {cert.opensslText && (
        <div className="cert-section">
          <div className="cert-section-title cert-section-clickable" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span onClick={() => setShowOpenssl(!showOpenssl)} style={{ flex: 1, cursor: 'pointer' }}>
              OpenSSL {showOpenssl ? '▾' : '▸'}
            </span>
            {showOpenssl && (
              <Space size={0}>
                <Tooltip title="去除首尾行和换行后复制">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      const lines = cert.opensslText!.split(/\r?\n/).filter((l) => l.length > 0)
                      const body = lines.slice(1, -1).join('').trim()
                      copyText(body)
                    }}
                  >
                    仅内容
                  </Button>
                </Tooltip>
                <Tooltip title="复制原文">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={(e) => { e.stopPropagation(); copyText(cert.opensslText!) }}
                  />
                </Tooltip>
              </Space>
            )}
          </div>
          {showOpenssl && (
            <pre className="cert-openssl-text">{cert.opensslText}</pre>
          )}
        </div>
      )}

      {/* Actions */}
      {cert.raw && (
        <div className="cert-actions">
          <Button
            size="small"
            icon={<LinkOutlined />}
            onClick={() => onSendToAsn1(cert.raw!)}
          >
            发送到 ASN.1 解析
          </Button>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyText(cert.raw!)}
          >
            复制 DER (Base64)
          </Button>
        </div>
      )}
    </div>
  )
}

export default function CertTab({ onStatusChange }: Props) {
  const [input, setInput] = useState('')
  const [certs, setCerts] = useState<CertInfo[]>([])
  const [parsing, setParsing] = useState(false)

  const handleParse = useCallback(async () => {
    const text = input.trim()
    if (!text) { message.warning('请输入证书内容'); return }
    setParsing(true)
    try {
      const results = await window.electronAPI?.parseCertificates(text)
      if (results && Array.isArray(results)) {
        setCerts(results as CertInfo[])
        const ok = results.filter((r: Record<string, unknown>) => !r.error).length
        const fail = results.length - ok
        onStatusChange(`解析完成: ${ok} 个证书${fail > 0 ? `, ${fail} 个失败` : ''}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error('解析失败: ' + msg)
    } finally {
      setParsing(false)
    }
  }, [input, onStatusChange])

  const handleFileImport = useCallback(async () => {
    const filePath = await window.electronAPI?.selectFile([
      { name: '证书文件', extensions: ['pem', 'crt', 'cer', 'der'] },
      { name: '所有文件', extensions: ['*'] },
    ])
    if (!filePath) return
    try {
      const ext = filePath.toLowerCase()
      if (ext.endsWith('.der') || ext.endsWith('.cer')) {
        const b64 = await window.electronAPI?.readFileAsBase64(filePath)
        if (b64) {
          const pem = `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`
          setInput(pem)
        }
      } else {
        const b64 = await window.electronAPI?.readFileAsBase64(filePath)
        if (b64) {
          const text = atob(b64)
          setInput(text)
        }
      }
      onStatusChange('已导入文件')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      message.error('读取文件失败: ' + msg)
    }
  }, [onStatusChange])

  const handleClear = useCallback(() => {
    setInput('')
    setCerts([])
    onStatusChange('已清空')
  }, [onStatusChange])

  const handleSendToAsn1 = useCallback((raw: string) => {
    window.dispatchEvent(
      new CustomEvent('float-clipboard-input', { detail: { tab: 'asn1', content: raw } }),
    )
    const tabsEl = document.querySelector('.main-tabs')
    if (tabsEl) {
      const asn1Tab = tabsEl.querySelector('[data-node-key="asn1"]') as HTMLElement
      asn1Tab?.click()
    }
    onStatusChange('已发送到 ASN.1 解析')
  }, [onStatusChange])

  return (
    <div className="cert-page">
      <div className="cert-input-area">
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"粘贴 PEM 格式的证书内容...\n例如:\n-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"}
          autoSize={{ minRows: 4, maxRows: 10 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        <div className="cert-toolbar">
          <Space>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleParse} loading={parsing}>
              解析
            </Button>
            <Button icon={<UploadOutlined />} onClick={handleFileImport}>
              导入文件
            </Button>
            <Button icon={<ClearOutlined />} onClick={handleClear}>
              清空
            </Button>
          </Space>
        </div>
      </div>

      <div className="cert-result-area">
        {certs.length === 0 ? (
          <div className="cert-empty">
            <Empty
              description="粘贴或导入证书后点击解析"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : certs.length === 1 ? (
          <CertDetail cert={certs[0]} onSendToAsn1={handleSendToAsn1} />
        ) : (
          <Collapse
            defaultActiveKey={certs.map((_, i) => String(i))}
            items={certs.map((cert, i) => ({
              key: String(i),
              label: (
                <span>
                  <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                  证书 {i + 1}: {cert.error ? '解析失败' : getCN(cert.subject || '')}
                  {cert.ca && <Badge count="CA" style={{ marginLeft: 8, backgroundColor: '#1890ff' }} />}
                  {cert.validTo && isExpired(cert.validTo) && <Tag color="red" style={{ marginLeft: 6 }}>已过期</Tag>}
                </span>
              ),
              children: <CertDetail cert={cert} onSendToAsn1={handleSendToAsn1} />,
            }))}
          />
        )}
      </div>
    </div>
  )
}
