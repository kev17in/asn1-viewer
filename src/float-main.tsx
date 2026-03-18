import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme as antdTheme } from 'antd'
import FloatButton from './components/FloatButton'
import { useState, useEffect } from 'react'

window.addEventListener('contextmenu', (e) => e.preventDefault())

function FloatApp() {
  const [mode, setMode] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    window.floatAPI?.getTheme().then((t) => {
      if (t === 'dark' || t === 'light') setMode(t as 'light' | 'dark')
    })

    const cleanup = window.floatAPI?.onThemeChange((m) => {
      if (m === 'dark' || m === 'light') setMode(m as 'light' | 'dark')
    })
    return cleanup
  }, [])

  return (
    <ConfigProvider
      theme={{
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: mode === 'dark' ? '#7aa2f7' : '#1a73e8',
          borderRadius: 6,
        },
      }}
    >
      <FloatButton isDark={mode === 'dark'} />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FloatApp />
  </React.StrictMode>,
)
