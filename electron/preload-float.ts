import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('floatAPI', {
  showMainWindow: () => ipcRenderer.invoke('float-show-main'),

  navigateToTab: (tab: string, clipboardContent?: string) =>
    ipcRenderer.invoke('float-navigate-tab', tab, clipboardContent),

  getClipboard: () => ipcRenderer.invoke('float-get-clipboard'),

  getClipboardHistory: () => ipcRenderer.invoke('get-clipboard-history'),

  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),

  onClipboardHistoryChanged: (callback: (history: Array<{ text: string; time: number }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, history: Array<{ text: string; time: number }>) => callback(history)
    ipcRenderer.on('clipboard-history-changed', handler)
    return () => ipcRenderer.removeListener('clipboard-history-changed', handler)
  },

  onClipboardChange: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('clipboard-changed', handler)
    return () => ipcRenderer.removeListener('clipboard-changed', handler)
  },

  setExpanded: (expanded: boolean) => ipcRenderer.invoke('float-set-expanded', expanded),

  savePosition: (x: number, y: number) => ipcRenderer.invoke('float-save-position', x, y),

  getPosition: () => ipcRenderer.invoke('float-get-position') as Promise<[number, number]>,

  moveTo: (x: number, y: number) => ipcRenderer.invoke('float-move-to', x, y),

  closeFloat: () => ipcRenderer.invoke('float-close'),

  disableFloat: () => ipcRenderer.invoke('float-disable'),

  quitApp: () => ipcRenderer.invoke('float-quit-app'),

  getTheme: () => ipcRenderer.invoke('get-effective-theme'),

  onThemeChange: (callback: (mode: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: string) => callback(mode)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },

  platform: process.platform,
})
