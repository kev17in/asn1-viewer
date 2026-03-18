import { spawn, ChildProcess, execSync } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class JavaBridge extends EventEmitter {
  private process: ChildProcess | null = null
  private requestId = 0
  private pending = new Map<number, PendingRequest>()
  private buffer = ''
  private ready = false
  private readonly timeout = 30000

  getJarPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'java-service.jar')
    }
    const libsDir = path.join(app.getAppPath(), 'java-service', 'build', 'libs')
    try {
      const files = fs.readdirSync(libsDir).filter((f: string) => f.endsWith('-all.jar'))
      if (files.length > 0) return path.join(libsDir, files[0])
    } catch { /* ignore */ }
    return path.join(libsDir, 'java-service-1.0.0.jar')
  }

  private findJavaCommand(): string {
    if (process.env.JAVA_HOME) {
      const javaPath = path.join(process.env.JAVA_HOME, 'bin', 'java')
      if (fs.existsSync(javaPath)) return javaPath
    }

    if (process.platform === 'darwin') {
      try {
        const javaHome = execSync('/usr/libexec/java_home', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
        if (javaHome) {
          const javaPath = path.join(javaHome, 'bin', 'java')
          if (fs.existsSync(javaPath)) return javaPath
        }
      } catch { /* java_home not found or no JDK installed */ }

      const commonPaths = [
        '/opt/homebrew/bin/java',
        '/usr/local/bin/java',
        '/usr/bin/java',
      ]
      for (const p of commonPaths) {
        if (fs.existsSync(p)) return p
      }
    }

    return 'java'
  }

  async start(): Promise<void> {
    if (this.process) return

    const jarPath = this.getJarPath()
    const javaCmd = this.findJavaCommand()

    console.log('[Java] JAR path:', jarPath)
    console.log('[Java] JAR exists:', fs.existsSync(jarPath))
    console.log('[Java] Java command:', javaCmd)

    if (!fs.existsSync(jarPath)) {
      throw new Error(`Java service JAR not found: ${jarPath}`)
    }

    this.process = spawn(javaCmd, [
      '-Xmx256m',
      '-Dfile.encoding=UTF-8',
      '-Dsun.jnu.encoding=UTF-8',
      '-jar', jarPath,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.process.stdout!.setEncoding('utf-8')
    this.process.stderr!.setEncoding('utf-8')

    this.process.stdout!.on('data', (data: string) => this.onData(data))
    this.process.stderr!.on('data', (data: string) => {
      console.error('[Java]', data.trim())
    })

    this.process.on('exit', (code) => {
      console.log('[Java] Process exited with code', code)
      this.process = null
      this.ready = false
      this.emit('status', 'stopped')
      for (const [, req] of this.pending) {
        clearTimeout(req.timer)
        req.reject(new Error('Java process exited'))
      }
      this.pending.clear()
    })

    this.process.on('error', (err) => {
      console.error('[Java] Process error:', err.message)
      this.emit('status', 'error')
    })

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Java process failed to start within 15s'))
      }, 15000)

      const checkReady = (data: string) => {
        if (data.includes('"ready"')) {
          clearTimeout(timer)
          this.ready = true
          this.emit('status', 'running')
          resolve()
        }
      }

      this.process!.stdout!.once('data', checkReady)
    })
  }

  stop(): void {
    if (this.process) {
      this.process.stdin!.end()
      this.process.kill()
      this.process = null
      this.ready = false
    }
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process || !this.ready) {
      throw new Error('Java service not running')
    }

    const id = ++this.requestId
    const request = JSON.stringify({ id, method, params: params || {} })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout for ${method} (${this.timeout}ms)`))
      }, this.timeout)

      this.pending.set(id, { resolve, reject, timer })
      this.process!.stdin!.write(request + '\n')
    })
  }

  private onData(data: string): void {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const msg = JSON.parse(trimmed)
        if (msg.ready) continue

        const id = msg.id as number
        const req = this.pending.get(id)
        if (!req) continue

        clearTimeout(req.timer)
        this.pending.delete(id)

        if (msg.error) {
          req.reject(new Error(msg.error.message || 'Unknown error'))
        } else {
          req.resolve(msg.result)
        }
      } catch {
        console.warn('[Java] Could not parse stdout line:', trimmed.substring(0, 200))
      }
    }
  }

  isRunning(): boolean {
    return this.ready && this.process !== null
  }
}

export const javaBridge = new JavaBridge()
