import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'fs-extra'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find package root by looking for package.json
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(join(dir, 'package.json'))) {
      return dir
    }
    dir = dirname(dir)
  }
  return startDir
}

const PACKAGE_ROOT = findPackageRoot(__dirname)

/**
 * Get current installed version from package.json
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    const pkgPath = join(PACKAGE_ROOT, 'package.json')
    const pkg = await fs.readJSON(pkgPath)
    return pkg.version || '0.0.0'
  }
  catch {
    return '0.0.0'
  }
}

/**
 * Get latest version from npm registry
 */
export async function getLatestVersion(packageName = 'ccg-workflow'): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`npm view ${packageName} version`)
    return stdout.trim()
  }
  catch {
    return null
  }
}

/**
 * Compare two semantic versions
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0
    const num2 = parts2[i] || 0

    if (num1 > num2)
      return 1
    if (num1 < num2)
      return -1
  }

  return 0
}

/**
 * Check if update is available
 */
export async function checkForUpdates(): Promise<{
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
}> {
  const currentVersion = await getCurrentVersion()
  const latestVersion = await getLatestVersion()

  if (!latestVersion) {
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: null,
    }
  }

  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
  }
}

/**
 * Get changelog between two versions (simplified)
 */
export async function getChangelog(fromVersion: string, toVersion: string): Promise<string[]> {
  // In a real implementation, this would fetch from CHANGELOG.md or GitHub releases
  // For now, return a placeholder
  return [
    `升级从 v${fromVersion} 到 v${toVersion}`,
    '• 优化命令模板',
    '• 更新专家提示词',
    '• 修复已知问题',
  ]
}
