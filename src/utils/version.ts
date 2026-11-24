import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'fs-extra'
import { dirname, join } from 'pathe'
import { fileURLToPath } from 'node:url'
import { version as bundledVersion } from '../../package.json'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find package root by looking for package.json (walk all the way to filesystem root)
function findPackageRoot(startDir: string): string {
  let dir = startDir

  while (true) {
    if (fs.existsSync(join(dir, 'package.json'))) {
      return dir
    }

    const parentDir = dirname(dir)
    if (parentDir === dir) {
      return dir
    }

    dir = parentDir
  }
}

const PACKAGE_ROOT = findPackageRoot(__dirname)

/**
 * Read version field from a package.json path
 */
async function readPackageVersion(pkgPath: string): Promise<string | null> {
  try {
    if (!(await fs.pathExists(pkgPath))) {
      return null
    }
    const pkg = await fs.readJSON(pkgPath)
    return pkg.version || null
  }
  catch {
    return null
  }
}

/**
 * Get current installed version from package.json
 */
export async function getCurrentVersion(): Promise<string> {
  // Prefer build-time bundled version (always available after unbuild)
  if (bundledVersion) {
    return bundledVersion
  }

  // Fallback: path relative to this file
  const relativePkgPath = fileURLToPath(new URL('../../package.json', import.meta.url))
  const relativeVersion = await readPackageVersion(relativePkgPath)
  if (relativeVersion) {
    return relativeVersion
  }

  // Fallback: walk up to find package root (for unusual runtime layouts)
  const rootPkgPath = join(PACKAGE_ROOT, 'package.json')
  const rootVersion = await readPackageVersion(rootPkgPath)
  if (rootVersion) {
    return rootVersion
  }

  return process.env.npm_package_version || '0.0.0'
}

/**
 * Get latest version from npm registry
 */
export async function getLatestVersion(packageName = 'ccg-ros2-workflow'): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`npm view ${packageName} version`)
    return stdout.trim()
  }
  catch {
    return null
  }
}

function parseVersion(version: string) {
  if (typeof version !== 'string') return null
  const match = /^v?(\d+(?:\.\d+){0,2})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version)
  if (!match) return null
  const [, main, pre, build] = match
  const core = main.split('.')
  const prerelease = pre?.split('.') ?? []
  if (core.length < 3 && (pre || build)) return null
  if ([...core, ...prerelease].some(id => /^0\d+$/.test(id))) return null
  while (core.length < 3) core.push('0')
  return { core, prerelease }
}

function compareIdentifiers(a: string, b: string): number {
  if (a === b) return 0
  const numericA = /^\d+$/.test(a)
  const numericB = /^\d+$/.test(b)
  if (numericA !== numericB) return numericA ? -1 : 1
  // No leading zeroes: digit count then ASCII order is exact even above MAX_SAFE_INTEGER.
  if (numericA && a.length !== b.length) return a.length > b.length ? 1 : -1
  return a > b ? 1 : -1
}

/**
 * Compare SemVer precedence, ignoring build metadata. Accept a leading v and
 * legacy bare major/minor shorthands. If either input is invalid, return 0
 * rather than suggesting an upgrade.
 */
export function compareVersions(v1: string, v2: string): number {
  const a = parseVersion(v1)
  const b = parseVersion(v2)
  if (!a || !b) return 0
  for (let i = 0; i < 3; i++) {
    const order = compareIdentifiers(a.core[i], b.core[i])
    if (order) return order
  }
  if (!a.prerelease.length && b.prerelease.length) return 1
  if (a.prerelease.length && !b.prerelease.length) return -1
  for (let i = 0; i < Math.min(a.prerelease.length, b.prerelease.length); i++) {
    const order = compareIdentifiers(a.prerelease[i], b.prerelease[i])
    if (order) return order
  }
  return Math.sign(a.prerelease.length - b.prerelease.length)
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
