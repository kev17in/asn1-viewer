import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  javaRpc: (method: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke('java-rpc', method, params),

  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('select-file', filters),

  readFileAsBase64: (filePath: string) =>
    ipcRenderer.invoke('read-file-base64', filePath),

  readFileAsBuffer: (filePath: string) =>
    ipcRenderer.invoke('read-file-buffer', filePath),

  saveFile: (data: number[], defaultName: string) =>
    ipcRenderer.invoke('save-file', data, defaultName),

  getConfig: (key: string) =>
    ipcRenderer.invoke('get-config', key),

  setConfig: (key: string, value: unknown) =>
    ipcRenderer.invoke('set-config', key, value),

  setAutoStart: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-start', enabled),

  onJavaStatus: (callback: (status: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('java-status', handler)
    return () => ipcRenderer.removeListener('java-status', handler)
  },

  getSystemTheme: () =>
    ipcRenderer.invoke('get-system-theme'),

  onSystemThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: string) => callback(theme)
    ipcRenderer.on('system-theme-changed', handler)
    return () => ipcRenderer.removeListener('system-theme-changed', handler)
  },

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getJavaStatus: () => ipcRenderer.invoke('get-java-status'),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  cryptoHash: (algorithm: string, data: string, inputEncoding: string) =>
    ipcRenderer.invoke('crypto-hash', algorithm, data, inputEncoding),

  cryptoHmac: (algorithm: string, data: string, key: string, inputEncoding: string, keyEncoding: string) =>
    ipcRenderer.invoke('crypto-hmac', algorithm, data, key, inputEncoding, keyEncoding),

  cryptoAes: (operation: string, mode: string, keyHex: string, ivHex: string, data: string, inputEncoding: string) =>
    ipcRenderer.invoke('crypto-aes', operation, mode, keyHex, ivHex, data, inputEncoding),

  cryptoRsa: (operation: string, keyPem: string, data: string, inputEncoding: string, padding: string) =>
    ipcRenderer.invoke('crypto-rsa', operation, keyPem, data, inputEncoding, padding),

  cryptoGenerateKey: (type: string, bits: number) =>
    ipcRenderer.invoke('crypto-generate-key', type, bits),

  getClipboardHistory: () =>
    ipcRenderer.invoke('get-clipboard-history'),

  clearClipboardHistory: () =>
    ipcRenderer.invoke('clear-clipboard-history'),

  deleteClipboardHistoryItem: (index: number) =>
    ipcRenderer.invoke('delete-clipboard-history-item', index),

  copyToClipboard: (text: string) =>
    ipcRenderer.invoke('copy-to-clipboard', text),

  toggleClipboardFavorite: (index: number) =>
    ipcRenderer.invoke('toggle-clipboard-favorite', index),

  setClipboardLabel: (index: number, label: string | undefined) =>
    ipcRenderer.invoke('set-clipboard-label', index, label),

  exportClipboardHistory: () =>
    ipcRenderer.invoke('export-clipboard-history'),

  getClipboardImage: (filename: string) =>
    ipcRenderer.invoke('get-clipboard-image', filename),

  copyImageToClipboard: (filename: string) =>
    ipcRenderer.invoke('copy-image-to-clipboard', filename),

  onClipboardHistoryChanged: (callback: (history: Array<{ text: string; time: number; favorite?: boolean; imageFile?: string; imageThumbnail?: string }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, history: Array<{ text: string; time: number; favorite?: boolean; imageFile?: string; imageThumbnail?: string }>) => callback(history)
    ipcRenderer.on('clipboard-history-changed', handler)
    return () => ipcRenderer.removeListener('clipboard-history-changed', handler)
  },

  getTodos: () =>
    ipcRenderer.invoke('get-todos'),

  saveTodos: (todos: unknown[]) =>
    ipcRenderer.invoke('save-todos', todos),

  onTodoReminder: (callback: (todoId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, todoId: string) => callback(todoId)
    ipcRenderer.on('todo-reminder', handler)
    return () => ipcRenderer.removeListener('todo-reminder', handler)
  },

  onTodosUpdated: (callback: (todos: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, todos: unknown[]) => callback(todos)
    ipcRenderer.on('todos-updated', handler)
    return () => ipcRenderer.removeListener('todos-updated', handler)
  },

  parseCertificate: (pem: string) =>
    ipcRenderer.invoke('parse-certificate', pem),

  parseCertificates: (pem: string) =>
    ipcRenderer.invoke('parse-certificates', pem),

  toggleFloatButton: (enabled: boolean) =>
    ipcRenderer.invoke('toggle-float-button', enabled),

  onNavigateTab: (callback: (tab: string, clipboardContent?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tab: string, clipboardContent?: string) =>
      callback(tab, clipboardContent)
    ipcRenderer.on('navigate-tab', handler)
    return () => ipcRenderer.removeListener('navigate-tab', handler)
  },

  onFloatButtonToggled: (callback: (enabled: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled)
    ipcRenderer.on('float-button-toggled', handler)
    return () => ipcRenderer.removeListener('float-button-toggled', handler)
  },

  platform: process.platform,
})
