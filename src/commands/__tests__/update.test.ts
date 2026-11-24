import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import fs from 'fs-extra'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { update } from '../update'

const child = vi.hoisted(() => ({ home: '', version: '', warning: '', code: 0, spawn: vi.fn() }))
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
    throw new Error(`Unexpected command: ${cmd}`)
  } })
  return { ...actual, exec, spawn: child.spawn, execSync: () => Buffer.from(`codeagent-wrapper version ${child.version}`) }
})

beforeEach(async () => {
  child.home = await fs.mkdtemp(join(tmpdir(), 'ccg-update-'))
  child.code = 0
  child.spawn.mockImplementation(() => {
    const proc = new EventEmitter()
    void fs.outputFile(join(child.home, '.claude/commands/ccg/go.md'), '# updated').then(() => {
      process.stdout.write('Child init finished\n')
      if (child.warning) process.stderr.write(child.warning)
      proc.emit('close', child.code, null)
    })
    return proc
  })
  const ext = process.platform === 'win32' ? '.exe' : ''
  await fs.outputFile(join(child.home, '.claude/bin', 'codeagent-wrapper' + ext), 'fixture')
})
afterEach(async () => { process.exitCode = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.remove(child.home) })

it.each(['6.0.0', '5.16.1'])('relays the new init result when a future package installs wrapper %s', async (actual) => {
  child.version = actual
  child.warning = actual === '6.0.0' ? '' : `codeagent-wrapper version: ${actual}; expected 6.0.0. Retry ccg-ros2-workflow update later.\n`
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  await update()
  const output = [log, warn, stdout, stderr].flatMap(spy => spy.mock.calls.flat()).join('\n')
  const options = expect.objectContaining({ stdio: ['ignore', 'inherit', 'inherit'], env: expect.objectContaining({ CCG_UPDATE_MODE: 'true' }) })
  if (process.platform === 'win32')
    expect(child.spawn).toHaveBeenCalledWith('npx.cmd --yes ccg-ros2-workflow@latest init --force --skip-mcp --skip-prompt', options)
  else
    expect(child.spawn).toHaveBeenCalledWith('npx', ['--yes', 'ccg-ros2-workflow@latest', 'init', '--force', '--skip-mcp', '--skip-prompt'], options)
  expect(output).toContain('Child init finished')
  if (child.warning) expect(output).toContain(child.warning.trim())
  else expect(output).not.toMatch(/expected 5\.16\.1|Binary download failed/)
})

it('restores the old commands and returns a nonzero exit code if child init fails', async () => {
  child.code = 7
  child.warning = ''
  const dir = join(child.home, '.claude/commands/ccg')
  await fs.outputFile(join(dir, 'old.md'), 'original')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await update()
  expect(process.exitCode).toBe(1)
  expect(await fs.readFile(join(dir, 'old.md'), 'utf8')).toBe('original')
  expect(await fs.pathExists(join(dir, 'go.md'))).toBe(false)
  expect(await fs.pathExists(dir + '.ccg-update-bak')).toBe(false)
})

it.skipIf(process.platform === 'win32').each(['timeout', 'SIGINT'])('stops the npx process group before rollback on %s', { timeout: 15_000 }, async (reason) => {
  const { spawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  const dir = join(child.home, '.claude/commands/ccg')
  const bin = join(child.home, 'bin')
  const pidFile = join(child.home, 'worker.pid')
  const termFile = join(child.home, 'worker.term')
  await fs.outputFile(join(dir, 'old.md'), 'original')
  const worker = `
    const fs = require('node:fs');
    process.on('SIGTERM', () => fs.writeFileSync(${JSON.stringify(termFile)}, 'received'));
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setTimeout(() => process.exit(17), 10_000);
  `
  await fs.outputFile(join(bin, 'npx'), `#!${process.execPath}
    const fs = require('node:fs');
    fs.mkdirSync(${JSON.stringify(dir)}, {recursive: true});
    fs.writeFileSync(${JSON.stringify(join(dir, 'new.md'))}, 'partial');
    process.on('SIGTERM', () => process.exit(3));
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], {stdio: 'ignore'});
  `, { mode: 0o755 })
  vi.stubEnv('PATH', bin + ':' + process.env.PATH)
  let closed = false
  child.spawn.mockImplementation((...args: Parameters<typeof spawn>) => {
    const proc = spawn(...args)
    proc.once('close', () => { closed = true })
    return proc
  })
  let stoppedAtRollback = false
  const move = fs.move.bind(fs)
  vi.spyOn(fs, 'move').mockImplementation(async (src, dest) => {
    if (src === dir + '.ccg-update-bak') {
      const pid = Number(await fs.readFile(pidFile, 'utf8'))
      try { process.kill(pid, 0) }
      catch (err) { stoppedAtRollback = closed && (err as NodeJS.ErrnoException).code === 'ESRCH' }
    }
    return move(src, dest)
  })
  const prior = process.listeners('SIGINT')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  // Start the shutdown clock only after both real OS processes are ready. Compiler/CI
  // load must not turn the timeout test into a test of how fast node itself starts.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const pending = update({ timeoutMs: 1000, graceMs: 2000 })
  try {
    const start = Date.now()
    while (!(await fs.pathExists(pidFile)) && Date.now() - start < 6000) await wait(20)
    expect(await fs.pathExists(pidFile)).toBe(true)
    // Invoke only this update's handler, not Vitest's own interrupt handlers.
    if (reason === 'SIGINT') {
      for (const listener of process.listeners('SIGINT').filter(fn => !prior.includes(fn))) listener('SIGINT')
    }
    else await vi.advanceTimersByTimeAsync(1000)
    const termStart = Date.now()
    while ((!closed || !(await fs.pathExists(termFile))) && Date.now() - termStart < 3000) await wait(20)
    expect(closed).toBe(true)
    expect(await fs.pathExists(termFile)).toBe(true)
    expect(await fs.pathExists(dir + '.ccg-update-bak')).toBe(true)
    await vi.advanceTimersByTimeAsync(2000) // SIGKILL; the real poll waits for group disappearance
  }
  finally { vi.useRealTimers() }
  await pending
  expect(stoppedAtRollback).toBe(true)
  expect(process.listeners('SIGINT')).toEqual(prior)
  expect(log.mock.calls.flat().join(' ')).toMatch(reason === 'timeout' ? /timed out/i : /SIGINT/)
  expect(await fs.readdir(dir)).toEqual(['old.md'])
  expect(process.exitCode).toBe(1)
})

it.each(['confirmed', 'no close', 'taskkill failed'])('Windows tree shutdown: %s', async (outcome) => {
  const dir = join(child.home, '.claude/commands/ccg')
  await fs.outputFile(join(dir, 'old.md'), 'original')
  const installer = Object.assign(new EventEmitter(), { pid: 4321, unref: vi.fn() })
  const killer = Object.assign(new EventEmitter(), { unref: vi.fn() })
  child.spawn.mockImplementation((file: string) => {
    if (file !== 'taskkill.exe') return installer
    if (outcome !== 'no close') installer.emit('close', 1, null)
    setImmediate(() => killer.emit('close', outcome === 'taskkill failed' ? 1 : 0))
    return killer
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  try { await update({ timeoutMs: 10, graceMs: 60 }) }
  finally { Object.defineProperty(process, 'platform', platform) }
  expect(child.spawn).toHaveBeenCalledWith('npx.cmd --yes ccg-ros2-workflow@latest init --force --skip-mcp --skip-prompt', expect.objectContaining({ shell: true }))
  expect(child.spawn).toHaveBeenCalledWith('taskkill.exe', ['/pid', '4321', '/T', '/F'], expect.anything())
  expect(process.exitCode).toBe(1)
  if (outcome === 'confirmed') expect(await fs.readFile(join(dir, 'old.md'), 'utf8')).toBe('original')
  else {
    expect(log.mock.calls.flat().join(' ')).toContain('安装进程可能仍在运行')
    expect(await fs.pathExists(dir)).toBe(false)
    expect(await fs.readFile(join(dir + '.ccg-update-bak', 'old.md'), 'utf8')).toBe('original')
    expect(installer.unref).toHaveBeenCalled()
  }
})
