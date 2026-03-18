/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    javaRpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    readFileAsBase64: (filePath: string) => Promise<string>
    readFileAsBuffer: (filePath: string) => Promise<Uint8Array>
    saveFile: (data: number[], defaultName: string) => Promise<boolean>
    getConfig: (key: string) => Promise<unknown>
    setConfig: (key: string, value: unknown) => Promise<void>
    getSystemTheme: () => Promise<string>
    onSystemThemeChanged: (callback: (theme: string) => void) => () => void
    setAutoStart: (enabled: boolean) => Promise<void>
    onJavaStatus: (callback: (status: string) => void) => () => void
    getAppVersion: () => Promise<string>
    getJavaStatus: () => Promise<string>
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<boolean>
    windowClose: () => Promise<void>
    windowIsMaximized: () => Promise<boolean>
    cryptoHash: (algorithm: string, data: string, inputEncoding: string) => Promise<string>
    cryptoHmac: (algorithm: string, data: string, key: string, inputEncoding: string, keyEncoding: string) => Promise<string>
    cryptoAes: (operation: string, mode: string, keyHex: string, ivHex: string, data: string, inputEncoding: string) => Promise<{ hex: string; base64?: string; text?: string }>
    cryptoRsa: (operation: string, keyPem: string, data: string, inputEncoding: string, padding: string) => Promise<{ hex: string; base64?: string; text?: string }>
    cryptoGenerateKey: (type: string, bits: number) => Promise<{ hex?: string; base64?: string; publicKey?: string; privateKey?: string }>
    getClipboardHistory: () => Promise<Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>>
    clearClipboardHistory: () => Promise<Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>>
    deleteClipboardHistoryItem: (index: number) => Promise<Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>>
    copyToClipboard: (text: string) => Promise<void>
    toggleClipboardFavorite: (index: number) => Promise<Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>>
    setClipboardLabel: (index: number, label: string | undefined) => Promise<Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>>
    exportClipboardHistory: () => Promise<boolean>
    getClipboardImage: (filename: string) => Promise<string | null>
    copyImageToClipboard: (filename: string) => Promise<void>
    onClipboardHistoryChanged: (callback: (history: Array<{ text: string; time: number; favorite?: boolean; label?: string; imageFile?: string; imageThumbnail?: string }>) => void) => () => void
    getTodos: () => Promise<Array<{ id: string; text: string; done: boolean; createdAt: number; priority?: 'high' | 'medium' | 'low'; dueDate?: number; reminderTime?: number; reminded?: boolean }>>
    saveTodos: (todos: Array<{ id: string; text: string; done: boolean; createdAt: number; priority?: 'high' | 'medium' | 'low'; dueDate?: number; reminderTime?: number; reminded?: boolean }>) => Promise<void>
    onTodoReminder: (callback: (todoId: string) => void) => () => void
    onTodosUpdated: (callback: (todos: unknown[]) => void) => () => void
    parseCertificate: (pem: string) => Promise<Record<string, unknown>>
    parseCertificates: (pem: string) => Promise<Array<Record<string, unknown>>>
    toggleFloatButton: (enabled: boolean) => Promise<void>
    onNavigateTab: (callback: (tab: string, clipboardContent?: string) => void) => () => void
    onFloatButtonToggled: (callback: (enabled: boolean) => void) => () => void
    platform: string
  }
  floatAPI: {
    showMainWindow: () => Promise<void>
    navigateToTab: (tab: string, clipboardContent?: string) => Promise<void>
    getClipboard: () => Promise<string>
    getClipboardHistory: () => Promise<Array<{ text: string; time: number }>>
    copyToClipboard: (text: string) => Promise<void>
    onClipboardChange: (callback: (text: string) => void) => () => void
    onClipboardHistoryChanged: (callback: (history: Array<{ text: string; time: number }>) => void) => () => void
    setExpanded: (expanded: boolean) => Promise<void>
    savePosition: (x: number, y: number) => Promise<void>
    getPosition: () => Promise<[number, number]>
    moveTo: (x: number, y: number) => Promise<void>
    closeFloat: () => Promise<void>
    disableFloat: () => Promise<void>
    quitApp: () => Promise<void>
    getTheme: () => Promise<unknown>
    onThemeChange: (callback: (mode: string) => void) => () => void
    platform: string
  }
}
