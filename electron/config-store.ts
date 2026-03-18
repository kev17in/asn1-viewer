import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const defaults: Record<string, unknown> = {
  windowWidth: 1000,
  windowHeight: 700,
  windowX: -1,
  windowY: -1,
  windowMaximized: false,
  theme: 'light',
  autoStart: false,
  floatButtonEnabled: false,
  floatX: -1,
  floatY: -1,
  clipboardMaxItems: 500,
  todos: [],
}

let data: Record<string, unknown> = { ...defaults }
let configPath = ''

function ensureLoaded() {
  if (!configPath) {
    configPath = path.join(app.getPath('userData'), 'config.json')
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        data = { ...defaults, ...JSON.parse(raw) }
      }
    } catch {
      data = { ...defaults }
    }
  }
}

function save() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // ignore write errors
  }
}

export function getConfig(key: string): unknown {
  ensureLoaded()
  return data[key] ?? defaults[key]
}

export function setConfig(key: string, value: unknown): void {
  ensureLoaded()
  data[key] = value
  save()
}
