import type { DoctorDependencies } from '../../utils/doctor-checks'
import fs from 'fs-extra'
import { tmpdir } from 'node:os'
import * as cp from 'node:child_process'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'smol-toml'
import { doctor } from '../doctor'
import { createHash } from 'node:crypto'
import { collectDoctorReport } from '../../utils/doctor-checks'
import { installSkills } from '../../utils/skill-manager'

vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof cp>()
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) }
})

let home: string
let exec: ReturnType<typeof vi.fn>
const hookFiles = ['task-utils.js', 'workflow-state.js', 'session-start.js', 'subagent-context.js', 'skill-router.js']
const hookEvents = { UserPromptSubmit: ['workflow-state.js', 'skill-router.js'], SessionStart: ['session-start.js'], PreToolUse: ['subagent-context.js'] }
function deps(extra: DoctorDependencies = {}): DoctorDependencies {
  return { home, nodeVersion: 'v22.0.0', platform: 'darwin', exec, ...extra }
}
async function config(frontend = 'claude', backend = 'claude', review = ['claude']) {
  await fs.outputFile(join(home, '.claude', '.ccg', 'config.toml'), stringify({
    general: { version: '3.6.8', language: 'zh-CN' },
    routing: { frontend: { primary: frontend, models: [frontend] }, backend: { primary: backend, models: [backend] }, review: { models: review } },
  }))
}
async function claudeInstall() {
  await fs.outputFile(join(home, '.claude', 'commands', 'ccg.md'), '# CCG')
  for (const name of hookFiles) await fs.outputFile(join(home, '.claude', 'hooks', 'ccg', name), '// hook')
  const hooks = Object.fromEntries(Object.entries(hookEvents).map(([event, names]) => [event, [{ hooks: names.map(name => ({ type: 'command', command: `node "${join(home, '.claude', 'hooks', 'ccg', name)}"` })) }]]))
  await fs.outputJSON(join(home, '.claude', 'settings.json'), { hooks, env: { SECRET_TOKEN: 'super-secret-value' } })
  await fs.outputFile(join(home, '.claude', 'rules', 'ccg-skills.md'), 'rule')
  await fs.outputFile(join(home, '.claude', 'rules', 'ccg-engine.md'), 'rule')
}
async function codexInstall() {
  await fs.outputFile(join(home, '.codex', '.ccg-version'), '3.6.8')
  await fs.outputFile(join(home, '.codex', 'config.toml'), '[features]\nfixture = true\n')
  await fs.outputFile(join(home, '.codex', 'AGENTS.md'), '<!-- CCG:START -->\nCCG')
  for (const file of ['agents/ccg-implement.toml', 'agents/ccg-review.toml', 'agents/ccg-research.toml', 'hooks/ccg-workflow.py']) {
    await fs.outputFile(join(home, '.codex', file), 'managed')
  }
  await fs.outputJSON(join(home, '.codex', 'hooks.json'), { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: `python3 ${join(home, '.codex', 'hooks', 'ccg-workflow.py')}`, timeout: 10 }] }] } })
  await fs.outputFile(join(home, '.claude', 'bin', 'codeagent-wrapper'), 'binary')
}
beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'ccg-doctor-'))
  exec = vi.fn(() => 'tool version 1.2.3')
})
afterEach(async () => { await fs.remove(home) })

describe('CCG doctor inventory', () => {
  it('does not treat unrelated Codex AGENTS.md or a non-version marker as installed', async () => {
    await fs.outputFile(join(home, '.codex', 'AGENTS.md'), '# User rules')
    await fs.outputFile(join(home, '.codex', '.ccg-version'), 'unrelated')
    const report = await collectDoctorReport(deps())
    expect(report.mode).toBe('none')
    expect(report.checks.find(c => c.id === 'installation.mode')?.status).toBe('fail')
    expect(exec).not.toHaveBeenCalled()
  })

  it('checks pure Claude mode without external model CLIs or the wrapper', async () => {
    await config()
    await claudeInstall()
    exec.mockReturnValue(null)
    const report = await collectDoctorReport(deps())
    expect(report.mode).toBe('claude')
    expect(report.failureCount).toBe(0)
    expect(report.checks.find(c => c.id === 'routing.pure-claude')?.status).toBe('pass')
    expect(exec).not.toHaveBeenCalled()
  })

  it('includes review-only backends and reports missing selected CLI only', async () => {
    await config('claude', 'claude', ['codex', 'gemini'])
    await claudeInstall()
    exec.mockImplementation((file: string) => file === 'codex' ? null : '1.2.3')
    const report = await collectDoctorReport(deps())
    expect(report.backends).toEqual(['claude', 'codex', 'gemini'])
    expect(report.checks.find(c => c.id === 'cli.codex')?.status).toBe('fail')
    expect(report.checks.find(c => c.id === 'cli.gemini')?.status).toBe('pass')
    expect(exec.mock.calls.map(call => call[0])).toEqual(['claude', 'codex', 'gemini'])
    expect(report.checks.some(c => c.id === 'cli.grok')).toBe(false)
  })

  it('checks Codex artifacts without requiring Claude hooks or commands', async () => {
    await codexInstall()
    await config('codex', 'codex', ['codex'])
    const report = await collectDoctorReport(deps())
    expect(report.mode).toBe('codex')
    expect(report.failureCount).toBe(0)
    expect(report.checks.some(c => c.id === 'claude.hooks')).toBe(false)
    expect(report.checks.find(c => c.id === 'codex.hook-registration')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'codex.hook-trust')).toMatchObject({ status: 'warn', remediation: expect.stringContaining('/hooks') })
    const dir = join(home, '.codex')
    const key = `${await fs.realpath(join(dir, 'hooks.json'))}:user_prompt_submit:0:0`
    const command = `python3 ${join(dir, 'hooks', 'ccg-workflow.py')}`
    // Codex 0.154.0 normalized payload, independent of installer code. The
    // temp directory varies, so hash this fixture with its actual command.
    const payload = JSON.stringify({ event_name: 'user_prompt_submit', hooks: [{ async: false, command, timeout: 10, type: 'command' }] })
    const hash = 'sha256:' + createHash('sha256').update(payload).digest('hex')
    await fs.outputFile(join(dir, 'config.toml'), stringify({ hooks: { state: { [key]: { trusted_hash: hash } } } }))
    const trusted = await collectDoctorReport(deps())
    expect(trusted.checks.find(c => c.id === 'codex.hook-trust')?.status).toBe('pass')
  })

  it('checks standalone Codex host without treating absent Claude config or delegation tools as damaged', async () => {
    await codexInstall()
    await fs.remove(join(home, '.claude'))
    const report = await collectDoctorReport(deps())
    expect(report.mode).toBe('codex')
    expect(report.failureCount).toBe(0)
    expect(report.backends).toEqual(['codex'])
    expect(report.checks.find(c => c.id === 'config')?.status).toBe('skip')
    expect(report.checks.find(c => c.id === 'binary.wrapper')).toMatchObject({ status: 'warn', detail: expect.stringContaining('unavailable') })
    expect(report.checks.find(c => c.id === 'codex.role-prompts')?.status).toBe('warn')
    expect(exec.mock.calls.map(call => call[0])).toEqual(['codex'])
    exec.mockReturnValue(null)
    const missingHost = await collectDoctorReport(deps())
    expect(missingHost.checks.find(c => c.id === 'cli.codex')?.status).toBe('fail')
  })

  it('reports legacy registration as outdated even when previously approved in Codex', async () => {
    await codexInstall()
    const dir = join(home, '.codex')
    const path = join(dir, 'hooks.json')
    await fs.writeJson(path, { hooks: { UserPromptSubmit: [{ hooks: [{
      type: 'command', command: 'python3 ~/.codex/hooks/ccg-workflow.py', timeout: 10,
    }] }] } })
    // Independently captured from codex-cli 0.154.0 app-server hooks/list.
    const key = `${await fs.realpath(path)}:user_prompt_submit:0:0`
    await fs.outputFile(join(dir, 'config.toml'), stringify({ hooks: { state: { [key]: {
      trusted_hash: 'sha256:aecf70fe8f35a00f5b581978a244b1be2515b52b40091a0cab8a87edc5bfe172',
    } } } }))
    const { checks } = await collectDoctorReport(deps())
    expect(checks.find(c => c.id === 'codex.hook-registration')?.status).not.toBe('fail')
    expect(checks.find(c => c.id === 'codex.hook-trust')).toMatchObject({
      status: 'warn', detail: expect.stringMatching(/outdated/i), remediation: 'Run ccg-ros2-workflow codex-mode install.',
    })
  })

  it('still requires Claude config in both modes and valid Codex artifacts in standalone mode', async () => {
    await codexInstall()
    await claudeInstall()
    const both = await collectDoctorReport(deps())
    expect(both.mode).toBe('both')
    expect(both.checks.find(c => c.id === 'config')?.status).toBe('fail')
    await fs.remove(join(home, '.claude'))
    await fs.outputFile(join(home, '.codex', 'config.toml'), 'invalid = "unterminated')
    const malformed = await collectDoctorReport(deps())
    expect(malformed.checks.find(c => c.id === 'codex.config')?.status).toBe('fail')
  })

  it('checks installed Codex delegation drivers as warnings and shows remediation in text', async () => {
    await codexInstall()
    await fs.remove(join(home, '.claude'))
    await fs.outputFile(join(home, '.codex', 'AGENTS.md'), '<!-- CCG:START -->\n--backend antigravity\n--backend claude\n')
    exec.mockImplementation((file: string) => file === 'codex' ? '1.2.3' : null)
    const output = vi.fn()
    const report = await doctor({}, deps({ output, setExitCode: vi.fn() }))
    expect(report.failureCount).toBe(0)
    expect(report.checks.find(c => c.id === 'cli.delegation.antigravity')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'cli.delegation.claude')?.status).toBe('warn')
    const text = output.mock.calls.map(call => call[0]).join('\n')
    expect(text).toContain(`No failures; ${report.warningCount} warning(s).`)
    expect(text).toContain('Run ccg-ros2-workflow init')
    expect(text).not.toContain('All checks passed.')
  })

  it('fails malformed config and unknown backend without echoing config content', async () => {
    await config('codex', 'secret-unknown-backend')
    await claudeInstall()
    const unknown = await collectDoctorReport(deps())
    expect(unknown.checks.find(c => c.id === 'routing.backends')?.status).toBe('fail')
    expect(JSON.stringify(unknown)).not.toContain('secret-unknown-backend')
    await fs.outputFile(join(home, '.claude', '.ccg', 'config.toml'), 'secret-token = "unterminated')
    const malformed = await collectDoctorReport(deps())
    expect(malformed.checks.find(c => c.id === 'config')?.status).toBe('fail')
    expect(JSON.stringify(malformed)).not.toContain('secret-token')
  })

  it('requires all five named scripts and all four expected event handlers', async () => {
    await config()
    await claudeInstall()
    await fs.remove(join(home, '.claude', 'hooks', 'ccg', 'task-utils.js'))
    await fs.outputFile(join(home, '.claude', 'hooks', 'ccg', 'unrelated.js'), '// not a replacement')
    const report = await collectDoctorReport(deps())
    expect(report.checks.find(c => c.id === 'claude.hooks')).toMatchObject({ status: 'fail', detail: '4/5 scripts; missing: task-utils.js' })
    await fs.outputJSON(join(home, '.claude', 'settings.json'), { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node /wrong/hooks/ccg/skill-router.js' }] }] } })
    const invalid = await collectDoctorReport(deps())
    expect(invalid.checks.find(c => c.id === 'claude.hook-registration')).toMatchObject({ status: 'fail', detail: '0/4 handlers across 3 events in settings.json' })
  })

  it('outputs standalone JSON without ANSI or secrets and sets nonzero failure exit code', async () => {
    await config()
    await claudeInstall()
    const output = vi.fn()
    const setExitCode = vi.fn()
    const healthy = await doctor({ json: true }, deps({ output, setExitCode }))
    expect(output).toHaveBeenCalledTimes(1)
    const text = output.mock.calls[0][0]
    expect(JSON.parse(text)).toEqual(healthy)
    expect(text).not.toContain('\x1B')
    expect(text).not.toContain('super-secret-value')
    expect(healthy.schemaVersion).toBe(1)
    expect(setExitCode).toHaveBeenLastCalledWith(0)
    await fs.remove(join(home, '.claude', 'settings.json'))
    await doctor({ json: true }, deps({ output, setExitCode }))
    expect(setExitCode).toHaveBeenLastCalledWith(1)
  })

  it('uses platform-specific Windows npm shims and native executables', async () => {
    await config('antigravity', 'codex', ['gemini', 'claude', 'kimi', 'grok', 'opencode'])
    await claudeInstall()
    await collectDoctorReport(deps({ platform: 'win32' }))
    expect(exec.mock.calls.filter(call => call[1][0] === '--version').map(call => call[0])).toEqual(['agy.exe', 'claude.exe', 'codex.cmd', 'gemini.cmd', 'grok.exe', 'kimi.exe', 'opencode.exe'])
    expect(exec.mock.calls.filter(call => call[1][0] !== '--version')).toEqual([['agy.exe', ['--help']]])
  })

  it.each([
    ['  --output-format <format>', 'pass'],
    ['  --output-formats', 'warn'],
    ['Usage: agy [--output-format FMT]', 'pass'],
    ['  -o|--output-format FMT', 'pass'],
    ['  --output-format: value', 'pass'],
    ['The new option replaces --output-format json.', 'warn'],
    [null, 'warn'],
  ])('checks Antigravity help (%s) without turning capability warnings into failures', async (help, status) => {
    await config('antigravity')
    await claudeInstall()
    await fs.outputFile(join(home, '.claude', 'bin', 'codeagent-wrapper'), 'fixture')
    exec.mockImplementation((_file: string, args: string[]) => args[0] === '--help' ? help : '1.0.0')
    const report = await collectDoctorReport(deps())
    expect(report.failureCount).toBe(0)
    expect(report.checks.find(c => c.id === 'cli.antigravity.output-format')).toMatchObject({
      status, remediation: status === 'warn' ? expect.stringContaining('agy update') : null,
    })
  })

  it('does not probe help for an unavailable or unselected Antigravity CLI', async () => {
    await claudeInstall()
    exec.mockReturnValue(null)
    for (const frontend of ['antigravity', 'gemini']) {
      await config(frontend)
      const report = await collectDoctorReport(deps())
      expect(report.checks.some(c => c.id === 'cli.antigravity.output-format')).toBe(false)
    }
    expect(exec.mock.calls.some(([, args]) => args[0] === '--help')).toBe(false)
  })

  it('uses real PATH probes: help may use stderr but a version must succeed on stdout', async () => {
    await config('antigravity', 'antigravity', ['antigravity'])
    await claudeInstall()
    const bin = join(home, 'bin')
    const win = process.platform === 'win32'
    const program = join(bin, win ? 'agy.cmd' : 'agy')
    const path = process.env.PATH
    try {
      await fs.ensureDir(bin)
      process.env.PATH = bin
      for (const [stdout, code, status] of [['agy dev build', 0, 'pass'], ['', 0, 'fail'], ['agy 1.2.3', 1, 'fail']] as const) {
        await fs.writeFile(program, win
          ? `@echo off\r\nif "%1"=="--help" (echo --output-format FMT 1>&2 & exit /b 0)\r\necho warning: Node v18.20.1 1>&2\r\n${stdout ? 'echo ' + stdout : ''}\r\nexit /b ${code}\r\n`
          : `#!/bin/sh\nif [ "$1" = --help ]; then echo '  --output-format FMT' >&2; exit 0; fi\necho 'warning: Node v18.20.1' >&2\nprintf '%s' '${stdout}'\nexit ${code}\n`, { mode: 0o755 })
        const report = await collectDoctorReport(deps({ exec: undefined, platform: process.platform }))
        const version = report.checks.find(c => c.id === 'cli.antigravity')
        expect(version?.status).toBe(status)
        expect(version?.detail).not.toContain('18.20.1')
        if (code === 0 && stdout) expect(report.checks.find(c => c.id === 'cli.antigravity.output-format')?.status).toBe('pass')
      }
    }
    finally { if (path === undefined) delete process.env.PATH; else process.env.PATH = path }
  })

  it('uses a non-ignorable signal for the bounded CLI probe', async () => {
    await config('antigravity')
    await claudeInstall()
    const spy = vi.mocked(cp.spawnSync).mockImplementation(() => ({ status: 1 } as ReturnType<typeof cp.spawnSync>))
    try {
      await collectDoctorReport(deps({ exec: undefined }))
      expect(spy).toHaveBeenCalledWith('agy', ['--version'], expect.objectContaining({ timeout: 10000, killSignal: 'SIGKILL' }))
    }
    finally { spy.mockRestore() }
  })

  it('probes the working Windows shim when agy.exe is absent', async () => {
    await config('antigravity')
    await claudeInstall()
    exec.mockImplementation((file: string, args: string[]) => file === 'agy.exe' ? null : args[0] === '--help' ? '--output-format=json' : '1.0.0')
    const report = await collectDoctorReport(deps({ platform: 'win32' }))
    expect(exec).toHaveBeenCalledWith('agy.cmd', ['--help'])
    expect(report.checks.find(c => c.id === 'cli.antigravity.output-format')?.status).toBe('pass')
  })

  it('marks a corrupt native skill manifest as failure and legacy skills as warnings', async () => {
    await config()
    await claudeInstall()
    await fs.outputFile(join(home, '.claude', 'skills', 'ccg', 'SKILL.md'), '# Legacy CCG')
    const legacy = await collectDoctorReport(deps())
    expect(legacy.checks.find(c => c.id === 'claude.skills')?.status).toBe('warn')
    await fs.ensureDir(join(home, '.claude', 'skills'))
    await fs.outputFile(join(home, '.claude', '.ccg-skills', 'manifest.json'), 'invalid-json')
    const corrupt = await collectDoctorReport(deps())
    expect(corrupt.checks.find(c => c.id === 'claude.skills')?.status).toBe('fail')
  })

  it('allows healthy skills-only installs without requiring routing, commands, hooks or model CLIs', async () => {
    const templatesDir = join(home, 'templates')
    await fs.outputFile(join(templatesDir, 'sample', 'SKILL.md'), '---\nname: sample\ndescription: Sample native skill\n---\n# Sample\n')
    const paths = { templatesDir, nativeDir: join(home, '.agents', 'skills'), storeDir: join(home, '.agents', '.ccg-skills') }
    await installSkills(['sample'], { target: 'codex', ...paths })
    const report = await collectDoctorReport(deps({ skillPaths: { codex: paths } }))
    expect(report.mode).toBe('skills')
    expect(report.failureCount).toBe(0)
    expect(report.checks.find(c => c.id === 'codex.skills')).toMatchObject({ status: 'pass', detail: '1/1 managed skills healthy' })
    expect(report.checks.some(c => c.id === 'binary.wrapper' || c.id === 'claude.hooks')).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })
})
