const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const javaServiceDir = path.join(__dirname, '..', 'java-service')
const libsDir = path.join(javaServiceDir, 'build', 'libs')

const hasBuiltJar = () => {
  try {
    return fs.readdirSync(libsDir).some(f => f.endsWith('-all.jar'))
  } catch {
    return false
  }
}

const forceRebuild = process.argv.includes('--force')

if (!forceRebuild && hasBuiltJar()) {
  console.log('[java:build] Fat JAR already exists, skipping build. Use --force to rebuild.')
  process.exit(0)
}

const isWindows = process.platform === 'win32'
const gradlew = isWindows ? 'gradlew.bat' : './gradlew'
const cmd = `${gradlew} fatJar`

console.log(`[java:build] Building Java service...`)
console.log(`[java:build] Running: ${cmd}`)

try {
  execSync(cmd, { cwd: javaServiceDir, stdio: 'inherit' })
  console.log('[java:build] Java service built successfully.')
} catch (err) {
  console.error('[java:build] Failed to build Java service.')
  console.error('[java:build] Make sure JDK 21+ is installed and JAVA_HOME is set.')
  process.exit(1)
}
