import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { getConfig } from './config-store'

interface ClipboardItem {
  text: string
  time: number
  favorite?: boolean
  label?: string
  imageFile?: string
  imageThumbnail?: string
  files?: string[]
}

const MAX_TEXT_LENGTH = 10240
const DEBOUNCE_MS = 3000

function getMaxItems(): number {
  const val = getConfig('clipboardMaxItems')
  return typeof val === 'number' && val > 0 ? val : 500
}

let history: ClipboardItem[] = []
let storePath = ''
let imageDirPath = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

function ensureLoaded() {
  if (!storePath) {
    storePath = path.join(app.getPath('userData'), 'clipboard-history.json')
    imageDirPath = path.join(app.getPath('userData'), 'clipboard-images')
    try {
      if (fs.existsSync(storePath)) {
        const raw = fs.readFileSync(storePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          history = parsed.sort((a, b) => b.time - a.time)
        }
      }
    } catch {
      history = []
    }
  }
}

function writeToDisk() {
  if (!storePath) return
  try {
    fs.writeFileSync(storePath, JSON.stringify(history), 'utf-8')
  } catch {
    // ignore
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    writeToDisk()
    saveTimer = null
  }, DEBOUNCE_MS)
}

function removeImageFile(item: ClipboardItem) {
  if (item.imageFile && imageDirPath) {
    try {
      const filePath = path.join(imageDirPath, item.imageFile)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch { /* ignore */ }
  }
}

function sortByTime() {
  history.sort((a, b) => b.time - a.time)
}

function trimHistory() {
  const maxItems = getMaxItems()
  const nonFavorites = history.filter((i) => !i.favorite)
  if (nonFavorites.length > maxItems) {
    // Remove oldest non-favorites beyond the limit
    const removed = nonFavorites.slice(maxItems)
    removed.forEach(removeImageFile)
    const keepNonFavKeys = new Set(nonFavorites.slice(0, maxItems).map((i) => i.time))
    history = history.filter((i) => i.favorite || keepNonFavKeys.has(i.time))
    sortByTime()
  }
}

export function loadClipboardHistory(): ClipboardItem[] {
  ensureLoaded()
  return history
}

export function addClipboardItem(text: string): ClipboardItem[] {
  ensureLoaded()
  const trimmed = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text
  const item: ClipboardItem = { text: trimmed, time: Date.now() }
  history.unshift(item)
  trimHistory()
  scheduleSave()
  return history
}

export function addClipboardImage(pngBuffer: Buffer, thumbnail: string, desc: string): ClipboardItem[] {
  ensureLoaded()
  if (!fs.existsSync(imageDirPath)) fs.mkdirSync(imageDirPath, { recursive: true })
  const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`
  fs.writeFileSync(path.join(imageDirPath, filename), pngBuffer)

  const item: ClipboardItem = {
    text: desc,
    time: Date.now(),
    imageFile: filename,
    imageThumbnail: thumbnail,
  }
  history.unshift(item)
  trimHistory()
  scheduleSave()
  return history
}

export function addClipboardFiles(filePaths: string[]): ClipboardItem[] {
  ensureLoaded()
  const desc = filePaths.length === 1
    ? path.basename(filePaths[0])
    : `${filePaths.length} 个文件`
  const item: ClipboardItem = {
    text: desc,
    time: Date.now(),
    files: filePaths,
  }
  history.unshift(item)
  trimHistory()
  scheduleSave()
  return history
}

export function deleteClipboardItem(index: number): ClipboardItem[] {
  ensureLoaded()
  if (index >= 0 && index < history.length) {
    removeImageFile(history[index])
    history.splice(index, 1)
    scheduleSave()
  }
  return history
}

export function toggleClipboardFavorite(index: number): ClipboardItem[] {
  ensureLoaded()
  if (index >= 0 && index < history.length) {
    history[index].favorite = !history[index].favorite
    if (!history[index].favorite) history[index].label = undefined
    scheduleSave()
  }
  return history
}

export function setClipboardLabel(index: number, label: string | undefined): ClipboardItem[] {
  ensureLoaded()
  if (index >= 0 && index < history.length) {
    history[index].label = label || undefined
    scheduleSave()
  }
  return history
}

export function clearClipboardHistory(): ClipboardItem[] {
  history.forEach(removeImageFile)
  history = []
  scheduleSave()
  return history
}

export function exportClipboardHistory(): string {
  ensureLoaded()
  return JSON.stringify(history, null, 2)
}

export function flushClipboardHistory() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  writeToDisk()
}

export function getClipboardImagePath(filename: string): string {
  ensureLoaded()
  return path.join(imageDirPath, filename)
}
