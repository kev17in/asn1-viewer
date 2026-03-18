import { useState, useEffect } from 'react'
import { Table, Button, Space, message, Popconfirm, Tag, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  getModules,
  importModule,
  removeModule,
  refreshRegistry,
  type ModuleInfo,
} from '../services/java-rpc'
import { useJavaStatus } from '../hooks/useJavaStatus'

const { Text } = Typography

interface Props {
  onStatusChange?: (s: string) => void
}

export default function ModuleManager({ onStatusChange }: Props) {
  const [modules, setModules] = useState<ModuleInfo[]>([])
  const [loading, setLoading] = useState(false)
  const javaStatus = useJavaStatus((s) => s.status)

  const loadModules = async () => {
    if (javaStatus !== 'running') return
    setLoading(true)
    try {
      const data = await getModules()
      setModules(data)
    } catch (err: any) {
      message.error('加载模块列表失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModules()
  }, [javaStatus])

  const handleImport = async () => {
    try {
      const filePath = await window.electronAPI.selectFile([
        { name: 'JAR Files', extensions: ['jar'] },
      ])
      if (!filePath) return

      const result = await importModule({ jarPath: filePath })
      message.success(`导入成功: ${result.moduleName} v${result.version} (${result.typeCount} 个类型)`)
      onStatusChange?.(`模块 ${result.moduleName} 导入成功`)
      await loadModules()
    } catch (err: any) {
      message.error('导入失败: ' + err.message)
    }
  }

  const handleRemove = async (moduleId: string) => {
    try {
      const result = await removeModule(moduleId)
      if (result.removed) {
        message.success('模块已删除')
        onStatusChange?.('模块已删除')
        await loadModules()
      }
    } catch (err: any) {
      message.error('删除失败: ' + err.message)
    }
  }

  const handleRefresh = async () => {
    try {
      await refreshRegistry()
      await loadModules()
      message.success('已刷新')
    } catch (err: any) {
      message.error('刷新失败: ' + err.message)
    }
  }

  const columns = [
    {
      title: '模块名',
      dataIndex: 'moduleName',
      key: 'moduleName',
      width: 180,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: '类型数',
      dataIndex: 'typeCount',
      key: 'typeCount',
      width: 80,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: 'JAR 路径',
      dataIndex: 'jarPath',
      key: 'jarPath',
      ellipsis: true,
      render: (path: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {path || '(内置)'}
        </Text>
      ),
    },
    {
      title: '内置',
      dataIndex: 'builtin',
      key: 'builtin',
      width: 60,
      render: (builtin: boolean) => (builtin ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: ModuleInfo) =>
        !record.builtin ? (
          <Popconfirm
            title="确定要删除这个模块吗？"
            onConfirm={() => handleRemove(record.moduleId)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        ) : null,
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleImport} disabled={javaStatus !== 'running'}>
          导入 JAR
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} disabled={javaStatus !== 'running'}>
          刷新
        </Button>
        <Text type="secondary">共 {modules.length} 个模块</Text>
      </Space>
      <Table
        columns={columns}
        dataSource={modules}
        rowKey="moduleId"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ y: 300 }}
      />
    </div>
  )
}
