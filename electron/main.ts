import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, clipboard, screen, Notification, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { javaBridge } from './java-bridge'
import { getConfig, setConfig } from './config-store'
import { loadClipboardHistory, addClipboardItem, addClipboardImage, addClipboardFiles, deleteClipboardItem, clearClipboardHistory, flushClipboardHistory, toggleClipboardFavorite, setClipboardLabel, exportClipboardHistory, getClipboardImagePath } from './clipboard-store'

let mainWindow: BrowserWindow | null = null
let floatWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let clipboardTimer: ReturnType<typeof setInterval> | null = null
let lastClipboardText = ''
let lastClipboardImageHash = ''
let lastClipboardFilesKey = ''
let todoReminderTimer: ReturnType<typeof setInterval> | null = null

const FLOAT_COLLAPSED_SIZE = 80
const FLOAT_EXPANDED_W = 310
const FLOAT_EXPANDED_H = 500

const DIST = path.join(__dirname, '../dist')

function stripDwmBorder(win: BrowserWindow | null) {
  if (!win || process.platform !== 'win32') return
  const b = win.getBounds()
  win.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height })
  setTimeout(() => win.setBounds(b), 0)
}
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const width = getConfig('windowWidth') as number
  const height = getConfig('windowHeight') as number

  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 550,
    title: 'ASN.1 Viewer',
    icon: getAppIcon(),
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  const x = getConfig('windowX') as number
  const y = getConfig('windowY') as number
  if (x > 0 && y > 0) {
    mainWindow.setPosition(x, y)
  }

  if (getConfig('windowMaximized')) {
    mainWindow.maximize()
  }

  mainWindow.on('resize', () => {
    if (!mainWindow?.isMaximized() && mainWindow?.isVisible() && !mainWindow?.isMinimized()) {
      const [w, h] = mainWindow.getSize()
      if (w >= 800) setConfig('windowWidth', w)
      if (h >= 550) setConfig('windowHeight', h)
    }
  })

  mainWindow.on('move', () => {
    if (!mainWindow?.isMaximized() && mainWindow?.isVisible() && !mainWindow?.isMinimized()) {
      const [px, py] = mainWindow.getPosition()
      if (px > 0 && py > 0) {
        setConfig('windowX', px)
        setConfig('windowY', py)
      }
    }
  })

  mainWindow.on('maximize', () => setConfig('windowMaximized', true))
  mainWindow.on('unmaximize', () => setConfig('windowMaximized', false))

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }
}

function getAppIcon() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')

  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath)
  }
  return nativeImage.createEmpty()
}

function createTray() {
  const icon = getAppIcon()
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示', click: () => showWindow() },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ])

  tray.setToolTip('ASN.1 Viewer')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => showWindow())
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function quitApp() {
  isQuitting = true
  javaBridge.stop()
  stopClipboardMonitor()
  if (todoReminderTimer) { clearInterval(todoReminderTimer); todoReminderTimer = null }
  if (tray) { tray.destroy(); tray = null }
  if (floatWindow) { floatWindow.destroy(); floatWindow = null }
  mainWindow?.close()
  mainWindow = null
  app.quit()
}

// ── Float Window ──────────────────────────────────

function createFloatWindow() {
  if (floatWindow) return

  const display = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = display.workAreaSize
  let fx = getConfig('floatX') as number
  let fy = getConfig('floatY') as number
  if (fx < 0 || fy < 0) {
    fx = screenW - FLOAT_COLLAPSED_SIZE - 20
    fy = Math.round(screenH / 2)
  }

  floatWindow = new BrowserWindow({
    width: FLOAT_COLLAPSED_SIZE,
    height: FLOAT_COLLAPSED_SIZE,
    x: fx,
    y: fy,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-float.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  floatWindow.webContents.on('context-menu', (e) => {
    e.preventDefault()
  })

  if (VITE_DEV_SERVER_URL) {
    floatWindow.loadURL(`${VITE_DEV_SERVER_URL}float.html`)
  } else {
    floatWindow.loadFile(path.join(DIST, 'float.html'))
  }

  floatWindow.once('ready-to-show', () => stripDwmBorder(floatWindow))

  floatWindow.on('moved', () => {
    if (!floatWindow) return
    const [px, py] = floatWindow.getPosition()
    setConfig('floatX', px)
    setConfig('floatY', py)
  })

  floatWindow.on('closed', () => {
    floatWindow = null
  })
}

function destroyFloatWindow() {
  if (floatWindow) {
    floatWindow.destroy()
    floatWindow = null
  }
}

let skipNextClipboardRecord = false

function imageQuickHash(img: Electron.NativeImage): string {
  const tiny = img.resize({ width: 16, height: 16 })
  return crypto.createHash('md5').update(tiny.toBitmap()).digest('hex')
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function readClipboardFiles(): string[] {
  try {
    const formats = clipboard.availableFormats()
    if (!formats.includes('text/uri-list')) return []

    // Windows: try FileNameW (single file, UTF-16LE null-terminated)
    try {
      const buf = clipboard.readBuffer('FileNameW')
      if (buf.length >= 4) {
        const p = buf.toString('utf16le').replace(/\0+$/, '').trim()
        if (p) return [p]
      }
    } catch { /* not available */ }

    return []
  } catch {
    return []
  }
}

function startClipboardMonitor() {
  if (clipboardTimer) return
  lastClipboardText = clipboard.readText()
  const initImg = clipboard.readImage()
  if (!initImg.isEmpty()) lastClipboardImageHash = imageQuickHash(initImg)
  const initFiles = readClipboardFiles()
  lastClipboardFilesKey = initFiles.join('\n')

  clipboardTimer = setInterval(() => {
    const text = clipboard.readText()
    const textChanged = text && text.trim() && text !== lastClipboardText

    if (textChanged) {
      lastClipboardText = text
      lastClipboardFilesKey = ''
      const img = clipboard.readImage()
      if (!img.isEmpty()) lastClipboardImageHash = imageQuickHash(img)

      if (skipNextClipboardRecord) {
        skipNextClipboardRecord = false
      } else {
        const updated = addClipboardItem(text)
        mainWindow?.webContents.send('clipboard-history-changed', updated)
        floatWindow?.webContents.send('clipboard-history-changed', updated)
      }
      floatWindow?.webContents.send('clipboard-changed', text)
      return
    }

    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      const hash = imageQuickHash(img)
      if (hash !== lastClipboardImageHash) {
        lastClipboardImageHash = hash
        if (skipNextClipboardRecord) {
          skipNextClipboardRecord = false
        } else {
          const pngBuf = img.toPNG()
          if (pngBuf.length <= MAX_IMAGE_BYTES) {
            const size = img.getSize()
            const desc = `图片 ${size.width}×${size.height}`
            const thumbWidth = Math.min(size.width, 200)
            const thumb = img.resize({ width: thumbWidth })
            const thumbDataUrl = `data:image/jpeg;base64,${thumb.toJPEG(60).toString('base64')}`
            const updated = addClipboardImage(pngBuf, thumbDataUrl, desc)
            mainWindow?.webContents.send('clipboard-history-changed', updated)
            floatWindow?.webContents.send('clipboard-history-changed', updated)
          }
        }
        return
      }
    }

    // Check for files (e.g. copied from Explorer)
    const filePaths = readClipboardFiles()
    if (filePaths.length > 0) {
      const filesKey = filePaths.join('\n')
      if (filesKey !== lastClipboardFilesKey) {
        lastClipboardFilesKey = filesKey
        if (skipNextClipboardRecord) {
          skipNextClipboardRecord = false
        } else {
          const updated = addClipboardFiles(filePaths)
          mainWindow?.webContents.send('clipboard-history-changed', updated)
          floatWindow?.webContents.send('clipboard-history-changed', updated)
        }
      }
    } else {
      lastClipboardFilesKey = ''
    }
  }, 800)
}

function stopClipboardMonitor() {
  if (clipboardTimer) {
    clearInterval(clipboardTimer)
    clipboardTimer = null
  }
}

function registerIpcHandlers() {
  ipcMain.handle('java-rpc', async (_event, method: string, params?: Record<string, unknown>) => {
    return javaBridge.call(method, params)
  })

  ipcMain.handle('select-file', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
    const buf = fs.readFileSync(filePath)
    return buf.toString('base64')
  })

  ipcMain.handle('read-file-buffer', async (_event, filePath: string) => {
    return fs.readFileSync(filePath)
  })

  ipcMain.handle('save-file', async (_event, data: number[], defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
    })
    if (result.canceled || !result.filePath) return false
    fs.writeFileSync(result.filePath, Buffer.from(data))
    return true
  })

  ipcMain.handle('get-config', (_event, key: string) => {
    return getConfig(key)
  })

  ipcMain.handle('set-config', (_event, key: string, value: unknown) => {
    setConfig(key, value)
    if (key === 'floatButtonEnabled') {
      if (value) createFloatWindow()
      else destroyFloatWindow()
    }
    if (key === 'theme') {
      const effectiveTheme = value === 'auto'
        ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
        : value
      floatWindow?.webContents.send('theme-changed', effectiveTheme)
    }
  })

  ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  ipcMain.handle('get-effective-theme', () => {
    const mode = getConfig('theme')
    if (mode === 'auto') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    return mode || 'light'
  })

  nativeTheme.on('updated', () => {
    const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    mainWindow?.webContents.send('system-theme-changed', systemTheme)
    const currentMode = getConfig('theme')
    if (currentMode === 'auto') {
      floatWindow?.webContents.send('theme-changed', systemTheme)
    }
  })

  ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    setConfig('autoStart', enabled)
  })

  ipcMain.handle('window-minimize', () => { mainWindow?.minimize() })
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
    return mainWindow?.isMaximized()
  })
  ipcMain.handle('window-close', () => { mainWindow?.hide() })
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-java-status', () => {
    return javaBridge.isRunning() ? 'running' : 'stopped'
  })

  // ── Float button handlers ────────────────────────

  ipcMain.handle('float-show-main', () => {
    showWindow()
  })

  ipcMain.handle('float-navigate-tab', (_event, tab: string, clipboardContent?: string) => {
    showWindow()
    mainWindow?.webContents.send('navigate-tab', tab, clipboardContent)
  })

  ipcMain.handle('float-get-clipboard', () => {
    return clipboard.readText()
  })

  let floatExpandDir = { anchorRight: true, anchorBottom: true }

  ipcMain.handle('float-set-expanded', (_event, expanded: boolean) => {
    if (!floatWindow) return
    const [x, y] = floatWindow.getPosition()
    if (expanded) {
      const display = screen.getDisplayNearestPoint({ x, y })
      const { x: wx, y: wy, width: sw, height: sh } = display.workArea
      const btnCenterX = x + FLOAT_COLLAPSED_SIZE / 2
      const btnCenterY = y + FLOAT_COLLAPSED_SIZE / 2

      let nx: number, ny: number
      const anchorRight = btnCenterX > wx + sw / 2
      const anchorBottom = btnCenterY > wy + sh / 2

      if (anchorRight) {
        nx = x + FLOAT_COLLAPSED_SIZE - FLOAT_EXPANDED_W
      } else {
        nx = x
      }
      if (anchorBottom) {
        ny = y + FLOAT_COLLAPSED_SIZE - FLOAT_EXPANDED_H
      } else {
        ny = y
      }

      nx = Math.max(wx, Math.min(nx, wx + sw - FLOAT_EXPANDED_W))
      ny = Math.max(wy, Math.min(ny, wy + sh - FLOAT_EXPANDED_H))

      floatExpandDir = { anchorRight, anchorBottom }
      floatWindow.setBounds({ x: nx, y: ny, width: FLOAT_EXPANDED_W, height: FLOAT_EXPANDED_H })
      stripDwmBorder(floatWindow)
      floatWindow.focus()
    } else {
      const [ex, ey] = floatWindow.getPosition()
      let nx: number, ny: number

      if (floatExpandDir.anchorRight) {
        nx = ex + FLOAT_EXPANDED_W - FLOAT_COLLAPSED_SIZE
      } else {
        nx = ex
      }
      if (floatExpandDir.anchorBottom) {
        ny = ey + FLOAT_EXPANDED_H - FLOAT_COLLAPSED_SIZE
      } else {
        ny = ey
      }

      floatWindow.setBounds({ x: nx, y: ny, width: FLOAT_COLLAPSED_SIZE, height: FLOAT_COLLAPSED_SIZE })
      stripDwmBorder(floatWindow)
    }
  })

  ipcMain.handle('float-save-position', (_event, x: number, y: number) => {
    setConfig('floatX', x)
    setConfig('floatY', y)
  })

  ipcMain.handle('float-get-position', () => {
    if (!floatWindow) return [0, 0]
    return floatWindow.getPosition()
  })

  ipcMain.handle('float-move-to', (_event, x: number, y: number) => {
    floatWindow?.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.handle('float-close', () => {
    floatWindow?.hide()
  })

  ipcMain.handle('float-disable', () => {
    destroyFloatWindow()
    setConfig('floatButtonEnabled', false)
    mainWindow?.webContents.send('float-button-toggled', false)
  })

  ipcMain.handle('float-quit-app', () => {
    quitApp()
  })

  ipcMain.handle('toggle-float-button', (_event, enabled: boolean) => {
    setConfig('floatButtonEnabled', enabled)
    if (enabled) createFloatWindow()
    else destroyFloatWindow()
  })

  // ── Clipboard history handlers ───────────────────

  ipcMain.handle('get-clipboard-history', () => {
    return loadClipboardHistory()
  })

  ipcMain.handle('clear-clipboard-history', () => {
    const updated = clearClipboardHistory()
    mainWindow?.webContents.send('clipboard-history-changed', updated)
    floatWindow?.webContents.send('clipboard-history-changed', updated)
    return updated
  })

  ipcMain.handle('delete-clipboard-history-item', (_event, index: number) => {
    const updated = deleteClipboardItem(index)
    mainWindow?.webContents.send('clipboard-history-changed', updated)
    floatWindow?.webContents.send('clipboard-history-changed', updated)
    return updated
  })

  ipcMain.handle('copy-to-clipboard', (_event, text: string) => {
    skipNextClipboardRecord = true
    clipboard.writeText(text)
    lastClipboardText = text
  })

  ipcMain.handle('toggle-clipboard-favorite', (_event, index: number) => {
    const updated = toggleClipboardFavorite(index)
    mainWindow?.webContents.send('clipboard-history-changed', updated)
    floatWindow?.webContents.send('clipboard-history-changed', updated)
    return updated
  })

  ipcMain.handle('set-clipboard-label', (_event, index: number, label: string | undefined) => {
    const updated = setClipboardLabel(index, label)
    mainWindow?.webContents.send('clipboard-history-changed', updated)
    floatWindow?.webContents.send('clipboard-history-changed', updated)
    return updated
  })

  ipcMain.handle('get-clipboard-image', (_event, filename: string) => {
    const filePath = getClipboardImagePath(filename)
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath)
      return `data:image/png;base64,${buf.toString('base64')}`
    }
    return null
  })

  ipcMain.handle('copy-image-to-clipboard', (_event, filename: string) => {
    const filePath = getClipboardImagePath(filename)
    if (fs.existsSync(filePath)) {
      skipNextClipboardRecord = true
      const img = nativeImage.createFromPath(filePath)
      clipboard.writeImage(img)
      lastClipboardImageHash = imageQuickHash(img)
    }
  })

  ipcMain.handle('export-clipboard-history', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `clipboard-history-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return false
    const data = exportClipboardHistory()
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return true
  })

  // ── Todo handlers ──────────────────────────────

  ipcMain.handle('get-todos', () => {
    return getConfig('todos') || []
  })

  ipcMain.handle('save-todos', (_event, todos: unknown[]) => {
    setConfig('todos', todos)
  })

  // ── Todo reminder ──────────────────────────────

  function checkTodoReminders() {
    const todos = (getConfig('todos') || []) as Array<{
      id: string; text: string; done: boolean; reminderTime?: number; reminded?: boolean
    }>
    const now = Date.now()
    let changed = false
    for (const todo of todos) {
      if (todo.reminderTime && !todo.reminded && !todo.done && todo.reminderTime <= now) {
        todo.reminded = true
        changed = true
        if (Notification.isSupported()) {
          const n = new Notification({
            title: '待办提醒',
            body: todo.text.length > 100 ? todo.text.slice(0, 100) + '...' : todo.text,
            icon: getAppIcon(),
          })
          n.on('click', () => showWindow())
          n.show()
        }
        mainWindow?.webContents.send('todo-reminder', todo.id)
      }
    }
    if (changed) {
      setConfig('todos', todos)
      mainWindow?.webContents.send('todos-updated', todos)
    }
  }

  function startTodoReminderTimer() {
    if (todoReminderTimer) return
    todoReminderTimer = setInterval(checkTodoReminders, 30_000)
  }

  function stopTodoReminderTimer() {
    if (todoReminderTimer) {
      clearInterval(todoReminderTimer)
      todoReminderTimer = null
    }
  }

  startTodoReminderTimer()

  // ── Certificate handlers ─────────────────────────

  ipcMain.handle('parse-certificate', (_event, pem: string) => {
    try {
      const cert = new crypto.X509Certificate(pem)
      return parseSingleCert(cert)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { error: msg }
    }
  })

  function wrapInPem(b64: string): string {
    return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`
  }

  function tryParseCert(input: string): Record<string, unknown> {
    const clean = input.replace(/^\uFEFF/, '').trim()

    // 1) direct PEM or DER buffer
    try {
      return parseSingleCert(new crypto.X509Certificate(clean))
    } catch { /* continue */ }

    // 2) try any PEM-like block (TRUSTED CERTIFICATE, X509 CERTIFICATE, etc.)
    const anyPem = clean.match(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/)
    if (anyPem) {
      try {
        return parseSingleCert(new crypto.X509Certificate(anyPem[0]))
      } catch { /* continue */ }
      const body = anyPem[0].replace(/-----[A-Z0-9 ]+----- */g, '').replace(/[\s\r\n]+/g, '')
      if (body.length >= 40) {
        try {
          return parseSingleCert(new crypto.X509Certificate(wrapInPem(body)))
        } catch { /* continue */ }
      }
    }

    const stripped = clean.replace(/[\s\r\n]+/g, '')

    // 3) raw Base64 (standard or URL-safe)
    const b64Std = stripped.replace(/-/g, '+').replace(/_/g, '/')
    if (/^[A-Za-z0-9+/]+=*$/.test(b64Std) && b64Std.length >= 40) {
      try {
        return parseSingleCert(new crypto.X509Certificate(wrapInPem(b64Std)))
      } catch { /* continue */ }
    }

    // 4) Hex encoded DER
    const hexClean = stripped.replace(/[:-]/g, '')
    if (/^[0-9a-fA-F]+$/.test(hexClean) && hexClean.length >= 40 && hexClean.length % 2 === 0) {
      try {
        const b64 = Buffer.from(hexClean, 'hex').toString('base64')
        return parseSingleCert(new crypto.X509Certificate(wrapInPem(b64)))
      } catch { /* continue */ }
    }

    return { error: '无法识别的证书格式，请提供 PEM、Base64 或 Hex 格式的证书数据' }
  }

  ipcMain.handle('parse-certificates', (_event, pem: string) => {
    const clean = pem.replace(/^\uFEFF/, '').trim()
    const certs: Array<Record<string, unknown>> = []
    const pemRegex = /-----BEGIN [A-Z0-9 ]*CERTIFICATE-----[\s\S]*?-----END [A-Z0-9 ]*CERTIFICATE-----/g
    const matches = clean.match(pemRegex)
    if (!matches || matches.length === 0) {
      return [tryParseCert(clean)]
    }
    for (const m of matches) {
      try {
        const cert = new crypto.X509Certificate(m)
        certs.push(parseSingleCert(cert))
      } catch {
        const body = m.replace(/-----[A-Z0-9 ]+----- */g, '').replace(/[\s\r\n]+/g, '')
        if (body.length >= 40) {
          try {
            const cert = new crypto.X509Certificate(wrapInPem(body))
            certs.push(parseSingleCert(cert))
            continue
          } catch { /* fall through */ }
        }
        certs.push(tryParseCert(m))
      }
    }
    return certs
  })

  function parseSingleCert(cert: crypto.X509Certificate) {
    const certAny = cert as any
    const sigAlg = typeof certAny.sigAlgName === 'string' ? certAny.sigAlgName : extractSigAlg(cert.toString())
    const opensslText = cert.toString()

    let publicKeyHex = ''
    try {
      const pubDer = cert.publicKey.export({ type: 'spki', format: 'der' })
      publicKeyHex = pubDer.toString('hex').toUpperCase()
    } catch { /* ignore */ }

    let publicKeyPinSha256 = ''
    try {
      const pubDer = cert.publicKey.export({ type: 'spki', format: 'der' })
      const hash = crypto.createHash('sha256').update(pubDer).digest('base64')
      publicKeyPinSha256 = hash
    } catch { /* ignore */ }

    const validFromMs = new Date(cert.validFrom).getTime()
    const validToMs = new Date(cert.validTo).getTime()
    const validDays = Math.ceil((validToMs - validFromMs) / 86400000)

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      validDays,
      fingerprint: cert.fingerprint,
      fingerprint256: cert.fingerprint256,
      fingerprint512: cert.fingerprint512,
      publicKey: {
        algorithm: cert.publicKey.asymmetricKeyType,
        size: (cert.publicKey as any).asymmetricKeySize as number | undefined,
      },
      publicKeyHex,
      publicKeyPinSha256,
      sigAlg,
      subjectAltName: cert.subjectAltName,
      keyUsage: cert.keyUsage,
      infoAccess: cert.infoAccess,
      raw: cert.raw.toString('base64'),
      ca: cert.ca,
      opensslText,
    }
  }

  function extractSigAlg(certStr: string): string {
    const m = certStr.match(/Signature Algorithm:\s*(.+)/i)
    return m?.[1]?.trim() || ''
  }

  // ── Crypto handlers ──────────────────────────────

  function resolveBuffer(data: string, encoding: string): Buffer {
    if (encoding === 'hex') return Buffer.from(data.replace(/\s+/g, ''), 'hex')
    if (encoding === 'base64') return Buffer.from(data, 'base64')
    return Buffer.from(data, 'utf-8')
  }

  ipcMain.handle('crypto-hash', (_event, algorithm: string, data: string, inputEncoding: string) => {
    const buf = resolveBuffer(data, inputEncoding)
    return crypto.createHash(algorithm).update(buf).digest('hex')
  })

  ipcMain.handle('crypto-hmac', (_event, algorithm: string, data: string, key: string, inputEncoding: string, keyEncoding: string) => {
    const dataBuf = resolveBuffer(data, inputEncoding)
    const keyBuf = resolveBuffer(key, keyEncoding)
    return crypto.createHmac(algorithm, keyBuf).update(dataBuf).digest('hex')
  })

  ipcMain.handle('crypto-aes', (_event, operation: string, mode: string, keyHex: string, ivHex: string, data: string, inputEncoding: string) => {
    const keyBuf = Buffer.from(keyHex.replace(/\s+/g, ''), 'hex')
    const keyBits = keyBuf.length * 8
    const algo = `aes-${keyBits}-${mode}`
    const dataBuf = resolveBuffer(data, inputEncoding)

    if (operation === 'encrypt') {
      const cipher = mode === 'ecb'
        ? crypto.createCipheriv(algo, keyBuf, null)
        : crypto.createCipheriv(algo, keyBuf, Buffer.from(ivHex.replace(/\s+/g, ''), 'hex'))
      const encrypted = Buffer.concat([cipher.update(dataBuf), cipher.final()])
      return { hex: encrypted.toString('hex'), base64: encrypted.toString('base64') }
    } else {
      const decipher = mode === 'ecb'
        ? crypto.createDecipheriv(algo, keyBuf, null)
        : crypto.createDecipheriv(algo, keyBuf, Buffer.from(ivHex.replace(/\s+/g, ''), 'hex'))
      const decrypted = Buffer.concat([decipher.update(dataBuf), decipher.final()])
      return { hex: decrypted.toString('hex'), text: decrypted.toString('utf-8') }
    }
  })

  ipcMain.handle('crypto-rsa', (_event, operation: string, keyPem: string, data: string, inputEncoding: string, padding: string) => {
    const dataBuf = resolveBuffer(data, inputEncoding)
    const pad = padding === 'oaep' ? crypto.constants.RSA_PKCS1_OAEP_PADDING : crypto.constants.RSA_PKCS1_PADDING

    if (operation === 'encrypt') {
      const encrypted = crypto.publicEncrypt(
        { key: keyPem, padding: pad, ...(padding === 'oaep' ? { oaepHash: 'sha256' } : {}) },
        dataBuf,
      )
      return { hex: encrypted.toString('hex'), base64: encrypted.toString('base64') }
    } else {
      const decrypted = crypto.privateDecrypt(
        { key: keyPem, padding: pad, ...(padding === 'oaep' ? { oaepHash: 'sha256' } : {}) },
        dataBuf,
      )
      return { hex: decrypted.toString('hex'), text: decrypted.toString('utf-8') }
    }
  })

  ipcMain.handle('crypto-generate-key', (_event, type: string, bits: number) => {
    if (type === 'random') {
      const bytes = crypto.randomBytes(bits / 8)
      return { hex: bytes.toString('hex'), base64: bytes.toString('base64') }
    }
    if (type === 'aes') {
      const bytes = crypto.randomBytes(bits / 8)
      return { hex: bytes.toString('hex'), base64: bytes.toString('base64') }
    }
    if (type === 'rsa') {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: bits,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      return { publicKey, privateKey }
    }
    throw new Error(`Unknown key type: ${type}`)
  })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.whenReady().then(async () => {
    loadClipboardHistory()
    registerIpcHandlers()
    createWindow()
    createTray()
    startClipboardMonitor()

    if (getConfig('floatButtonEnabled')) {
      createFloatWindow()
    }

    try {
      await javaBridge.start()
      mainWindow?.webContents.send('java-status', 'running')
    } catch (err) {
      console.error('Failed to start Java service:', err)
      mainWindow?.webContents.send('java-status', 'error')
    }

    javaBridge.on('status', (status: string) => {
      mainWindow?.webContents.send('java-status', status)
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    flushClipboardHistory()
  })

  app.on('window-all-closed', () => {
    // Do not quit; tray keeps app alive
  })

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    else showWindow()
  })
}
