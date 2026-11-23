import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { update } from '../update'

const child = vi.hoisted(() => ({ home: '', version: '', warning: '' }))
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => child.home }))
vi.mock('../../utils/version', async (original) => ({
  ...await original<typeof import('../../utils/version')>(),
  checkForUpdates: async () => ({ hasUpdate: true, currentVersion: '3.7.6', latestVersion: '4.0.0' }),
}))
vi.mock('../../utils/config', () => ({ readCcgConfig: async () => null }))
vi.mock('../../utils/migration', () => ({ needsMigration: async () => false }))
vi.mock('inquirer', () => ({ default: { prompt: async () => ({ confirmUpdate: true }) } }))
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  // Model npx installing a future package whose expected version is unknown to this process.
  const exec = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: async (cmd: string) => {
    if (cmd.startsWith('npm list ') || cmd.includes('--version') || cmd === 'npx clear-npx-cache') return { stdout: '', stderr: '' }
    if (cmd !== 'npx --yes ccg-ros2-workflow@latest init --force --skip-mcp --skip-prompt') throw new Error(`Unexpected command: ${cmd}`)
    await fs.outputFile(join(child.home, '.claude/commands/ccg/go.md'), '# updated')
    return { stdout: 'Child init finished\n', stderr: child.warning }
  } })
  return { ...actual, exec, execSync: () => Buffer.from(`codeagent-wrapper version ${child.version}`) }
})

beforeEach(async () => {
  child.home = await fs.mkdtemp(join(tmpdir(), 'ccg-update-'))
  const ext = process.platform === 'win32' ? '.exe' : ''
  await fs.outputFile(join(child.home, '.claude/bin', 'codeagent-wrapper' + ext), 'fixture')
})
afterEach(async () => { vi.restoreAllMocks(); await fs.remove(child.home) })

it.each(['6.0.0', '5.16.1'])('relays the new init result when a future package installs wrapper %s', async (actual) => {
  child.version = actual
  child.warning = actual === '6.0.0' ? '' : `codeagent-wrapper version: ${actual}; expected 6.0.0. Retry ccg-ros2-workflow update later.\n`
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  await update()
  const output = [log, warn, stdout, stderr].flatMap(spy => spy.mock.calls.flat()).join('\n')
  expect(output).toContain('Child init finished')
  if (child.warning) expect(output).toContain(child.warning.trim())
  else expect(output).not.toMatch(/expected 5\.16\.1|Binary download failed/)
})
