import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as cp from 'node:child_process'
import { init } from '../../commands/init'
import { initI18n } from '../../i18n'
import cac from 'cac'
import { setupCommands } from '../../cli-setup'
import { showBinaryDownloadWarning } from '../installer'
import { createDefaultConfig, createDefaultRouting } from '../config'
import { injectConfigVariables } from '../installer-template'
import { promptOpencodeModel, validateOpencodeModel } from '../model-selection'

const mocks = vi.hoisted(() => ({
  existing: null as any,
  writeConfig: vi.fn(),
  install: vi.fn(),
  prompt: vi.fn(),
  pathExists: vi.fn(),
  installedNames: vi.fn(),
  spinnerFailed: vi.fn(),
  spinnerSucceeded: vi.fn(),
  installMcp: vi.fn(),
  writeSettings: vi.fn(),
}))

vi.mock('inquirer', () => ({ default: { prompt: mocks.prompt, Separator: class {} } }))
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof cp>()
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) }
})
vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<{ default: typeof import('fs-extra') }>('fs-extra')
  return { default: { ...actual.default, pathExists: mocks.pathExists, writeJSON: mocks.writeSettings } }
})
vi.mock('ora', () => ({
  default: () => ({ start() { return this }, succeed: mocks.spinnerSucceeded, fail: mocks.spinnerFailed }),
}))
vi.mock('../../i18n', () => ({ i18n: { t: (key: string) => key }, initI18n: vi.fn() }))
vi.mock('../migration', () => ({ needsMigration: vi.fn().mockResolvedValue(false), migrateToV1_4_0: vi.fn() }))
vi.mock('../config', async () => ({
  ...await vi.importActual<typeof import('../config')>('../config'),
  readCcgConfig: () => Promise.resolve(mocks.existing),
  writeCcgConfig: mocks.writeConfig,
  ensureCcgDir: vi.fn(),
}))
vi.mock('../installer', async () => ({
  ...await vi.importActual<typeof import('../installer')>('../installer'),
  getCoreCommandIds: () => ['go'],
  getAllCommandIds: () => ['go', 'plan'],
  installWorkflows: mocks.install,
  showBinaryDownloadWarning: vi.fn(),
  configureGeminiCliApi: vi.fn(),
  installAceTool: vi.fn(),
  installAceToolRs: vi.fn(),
  installContextWeaver: vi.fn(),
  installFastContext: vi.fn(),
  installMcpServer: mocks.installMcp,
  syncMcpToCodex: async () => ({ success: true, synced: [] }),
  syncMcpToGemini: async () => ({ success: true, synced: [] }),
  writeFastContextPrompt: vi.fn(),
}))
vi.mock('../skill-manager', () => ({
  resolveSkillPaths: (options: any) => ({
    target: 'claude', nativeDir: '/tmp/ccg-default/skills', storeDir: '/tmp/ccg-default/.ccg-skills', ...options,
  }),
  SKILL_MANIFEST_FILE: 'manifest.json',
  installedNames: mocks.installedNames,
  getSkillCatalog: () => [
    { name: 'verify-change', description: 'Review changes' },
    { name: 'multi-agent', description: 'Coordinate agents' },
  ],
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PATH', '/no-such-ccg-test-bin')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.pathExists.mockResolvedValue(false)
  mocks.installedNames.mockResolvedValue([])
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.existing = createDefaultConfig({
    language: 'en',
    routing: {
      ...createDefaultRouting(),
      backend: { models: ['opencode'], primary: 'opencode', strategy: 'fallback' },
      opencodeModel: 'deepseek/custom-test-model',
    },
    installedWorkflows: ['go'],
    mcpProvider: 'skip',
  })
  mocks.install.mockResolvedValue({ success: true, installedCommands: [], installedPrompts: [], errors: [] })
})
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled()
  process.exitCode = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function answerInitQuestions(overrides: Record<string, any> = {}) {
  mocks.prompt.mockImplementation(async (questions: any[]) => {
    const answers: Record<string, any> = {
      apiProvider: 'skip', wireGeminiCli: false,
      url: 'https://gateway.example.test', key: 'custom-test-key',
      selectedFrontend: 'codex', selectedBackend: 'opencode',
      selectedOpencodeModel: questions[0].default,
      perfMode: 'standard', versionMode: 'v3', skillsMode: 'legacy', action: 'confirm',
      ...overrides,
    }
    return Object.fromEntries(questions.map((question) => {
      if (!(question.name in answers))
        throw new Error(`Unexpected prompt: ${question.name}`)
      return [question.name, answers[question.name]]
    }))
  })
}

describe('CLI install options', () => {
  const unattended = { skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' }
  it('exits nonzero when a route flag has no argument', async () => {
    const home = await mkdtemp(join(tmpdir(), 'ccg-cli-args-'))
    try {
      const result = cp.spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'init', '--skip-prompt', '-F'], {
        cwd: join(import.meta.dirname, '../../..'), encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
      })
      expect(result.stderr).toMatch(/frontend.*value is missing/)
      expect(result.status).toBe(1)
    }
    finally { await rm(home, { recursive: true, force: true }) }
  })
  it('registers update without running it and drops obsolete init options', async () => {
    const cli = cac()
    await setupCommands(cli)
    cli.parse(['node', 'ccg', 'update'], { run: false })
    expect(cli.matchedCommand?.name).toBe('update')
    const names = cli.commands.find(c => c.name === 'init')?.options.map(o => o.name)
    expect(names).not.toContain('mode')
    expect(names).not.toContain('workflows')
  })
  it('overrides saved routes and derives review without losing saved model IDs', async () => {
    await init({ ...unattended, frontend: 'kimi, codex,kimi', backend: 'opencode,codex' })
    const { routing } = mocks.writeConfig.mock.calls[0][0]
    expect(routing.frontend).toMatchObject({ primary: 'kimi', models: ['kimi', 'codex'] })
    expect(routing.backend).toMatchObject({ primary: 'opencode', models: ['opencode', 'codex'] })
    expect(routing.review.models).toEqual(['kimi', 'codex', 'opencode'])
    expect(routing.opencodeModel).toBe('deepseek/custom-test-model')
    expect(mocks.install.mock.calls[0][3].routing).toEqual(routing)
  })
  it.each([['frontend', 'unknown'], ['backend', 'codex,'], ['frontend', '']])('rejects --%s=%j before writing', async (option, value) => {
    await expect(init({ ...unattended, [option]: value })).rejects.toThrow(`--${option}`)
    expect(mocks.writeConfig).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('uses explicit routes as wizard defaults', async () => {
    answerInitQuestions()
    await init({ skipMcp: true, installDir: unattended.installDir, frontend: 'claude,codex', backend: 'grok' })
    const prompts = mocks.prompt.mock.calls.flatMap(([questions]) => questions)
    expect(prompts.find(q => q.name === 'selectedFrontend').default).toBe('claude')
    expect(prompts.find(q => q.name === 'selectedBackend').default).toBe('grok')
  })
  it.each([[undefined, 'en'], ['zh-CN', 'zh-CN']] as const)('preserves saved language unless --lang=%s overrides it', async (lang, expected) => {
    await init({ ...unattended, lang })
    expect(initI18n).toHaveBeenCalledWith(expected)
    expect(mocks.writeConfig.mock.calls[0][0].general.language).toBe(expected)
  })
  it('warns in the wizard summary that generated templates are refreshed', async () => {
    answerInitQuestions()
    await init({ skipMcp: true, installDir: unattended.installDir })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('init:refreshTemplates'))
    expect(mocks.install.mock.calls[0][3].refreshTemplates).toBe(true)
  })
  it.each([[], ['context7']].map(tools => [tools] as const))('honors context7 checkbox: %j', async (selectedTools) => {
    mocks.installMcp.mockResolvedValue({ success: true })
    answerInitQuestions({ gate: 'continue', selectedTools })
    await init({ installDir: unattended.installDir })
    const servers = mocks.installMcp.mock.calls.map(([name]) => name)
    expect(servers.includes('context7')).toBe(selectedTools.includes('context7'))
  })
})

describe('Antigravity compatibility at the end of noninteractive init', () => {
  let bin: string
  const win = process.platform === 'win32'
  async function fakeAgy(help: string, code = 0) {
    await writeFile(join(bin, win ? 'agy.cmd' : 'agy'), win
      ? `@echo off\r\nif not "%1"=="--help" exit /b 2\r\necho ${help} 1>&2\r\nexit /b ${code}\r\n`
      : `#!/bin/sh\n[ "$1" = --help ] || exit 2\necho '${help}' >&2\nexit ${code}\n`, { mode: 0o755 })
  }
  beforeEach(async () => {
    bin = await mkdtemp(join(tmpdir(), 'ccg-agy-'))
    vi.stubEnv('PATH', bin)
    for (const role of ['frontend', 'backend', 'review'])
      mocks.existing.routing[role].models = ['codex']
  })
  afterEach(async () => { await rm(bin, { recursive: true, force: true }) })
  async function reinstall() {
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.spinnerSucceeded).toHaveBeenCalled()
    expect(mocks.spinnerFailed).not.toHaveBeenCalled()
    expect(process.exitCode ?? 0).toBe(0)
  }
  it.each(['frontend', 'backend'])('warns when %s selects an old agy', async (role) => {
    mocks.existing.routing[role].models = ['antigravity']
    await fakeAgy('--help')
    await reinstall()
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('init:agyUpdate'))
  })
  it('stays silent when the flag is listed on stderr', async () => {
    mocks.existing.routing.frontend.models = ['antigravity']
    await fakeAgy('--output-format FMT')
    await reinstall()
    expect(cp.spawnSync).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
  })
  it('never probes without an Antigravity route', async () => {
    await fakeAgy('--help')
    await reinstall()
    expect(cp.spawnSync).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })
  it('uses the installed review route rather than a stale saved one', async () => {
    mocks.existing.routing.review.models = ['antigravity']
    await fakeAgy('--help')
    await reinstall()
    expect(mocks.writeConfig.mock.calls[0][0].routing.review.models).toEqual(['codex'])
    expect(cp.spawnSync).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })
  it('recommends installation instead of updating a missing CLI', async () => {
    mocks.existing.routing.backend.models = ['antigravity']
    await reinstall()
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('init:agyMissing'))
  })
  it.each(['nonzero', 'timeout'])('warns without failing installation on a %s help probe', async (failure) => {
    mocks.existing.routing.frontend.models = ['antigravity']
    await fakeAgy('--output-format FMT', 1)
    if (failure === 'timeout') {
      vi.mocked(cp.spawnSync).mockReturnValueOnce({
        error: Object.assign(new Error('spawn timed out'), { code: 'ETIMEDOUT' }),
        pid: 123, status: null, signal: 'SIGKILL', output: [], stdout: '', stderr: '',
      })
    }
    await reinstall()
    expect(cp.spawnSync).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({ timeout: 10000, killSignal: 'SIGKILL' }))
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('init:agyUpdate'))
  })
})

describe('API configuration during init', () => {
  it('reports a lagging preset at init without calling it a failed download', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.install.mockResolvedValue({ success: true, binVersionMismatch: true, binaryVersion: '5.15.0', installedCommands: ['go'], installedPrompts: [], errors: [] })
    await init({ skipPrompt: true, skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/5\.15\.0.*expected 5\.16\.1.*ccg-ros2-workflow update/)
    expect(warn.mock.calls.flat().join(' ')).toContain('https://github.com/GuYu-001/ccg-ros2-workflow/releases/tag/preset')
    expect(showBinaryDownloadWarning).not.toHaveBeenCalled()
    expect(process.exitCode).not.toBe(1)
  })

  it('prints download help before returning from an installation with a failed binary', async () => {
    mocks.install.mockResolvedValue({ success: false, binInstalled: false, errors: ['Failed to download binary'] })
    await init({ skipPrompt: true, skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    expect(showBinaryDownloadWarning).toHaveBeenCalledWith('/tmp/ccg-init-test/bin')
    expect(process.exitCode).toBe(1)
  })
  it('offers only official authentication, a custom API, skip and navigation', async () => {
    answerInitQuestions()
    await init({ skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    const question = mocks.prompt.mock.calls.flatMap(([questions]) => questions).find(q => q.name === 'apiProvider')
    expect(question.choices.filter((choice: any) => choice.value).map((choice: any) => choice.value)).toEqual([
      'official', 'thirdparty', 'skip', '__ccg_cancel__',
    ])
  })

  it('persists an explicitly supplied custom API URL and key', async () => {
    answerInitQuestions({ apiProvider: 'thirdparty' })
    await init({ skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    const write = mocks.writeSettings.mock.calls.find(([, settings]) => settings.env?.ANTHROPIC_BASE_URL)
    expect(write?.[0]).toBe('/tmp/ccg-init-test/settings.json')
    expect(write?.[1].env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://gateway.example.test',
      ANTHROPIC_AUTH_TOKEN: 'custom-test-key',
    })
  })

  it.each(['official', 'skip'])('does not write API credentials when choosing %s', async (apiProvider) => {
    answerInitQuestions({ apiProvider })
    await init({ skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    const writes = mocks.writeSettings.mock.calls.map(([, settings]) => settings.env)
    expect(writes.every(env => !env?.ANTHROPIC_BASE_URL && !env?.ANTHROPIC_AUTH_TOKEN)).toBe(true)
  })
})

describe('OpenCode configuration during init', () => {
  it('preserves the model during a non-interactive reinstall and injects it into execution templates', async () => {
    await init({ skipPrompt: true, skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig).toHaveBeenCalledTimes(1)
    const config = mocks.writeConfig.mock.calls[0][0]
    expect(config.routing.opencodeModel).toBe('deepseek/custom-test-model')
    const installOptions = mocks.install.mock.calls[0][3]
    const command = injectConfigVariables('wrapper --backend {{BACKEND_PRIMARY}} {{OPENCODE_MODEL_FLAG}}task', installOptions)
    expect(command).toContain('--backend opencode --opencode-model deepseek/custom-test-model task')
    expect(mocks.prompt).not.toHaveBeenCalled()
  })

  it('uses the saved model as the interactive default even when MCP configuration is skipped', async () => {
    answerInitQuestions()
    await init({ skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig).toHaveBeenCalledTimes(1)
    expect(mocks.writeConfig.mock.calls[0][0].routing.opencodeModel).toBe('deepseek/custom-test-model')
    const question = mocks.prompt.mock.calls.flatMap(([questions]) => questions).find(q => q.name === 'selectedOpencodeModel')
    expect(question.default).toBe('deepseek/custom-test-model')
  })

  it('shows saved native Skills as checked and saves only the explicit custom selection', async () => {
    mocks.existing.performance.skillsProfile = ['verify-change']
    answerInitQuestions({ skillsMode: 'custom', selectedSkills: ['multi-agent'] })
    await init({ skipMcp: true, force: true, installDir: '/tmp/ccg-init-test' })
    const question = mocks.prompt.mock.calls.flatMap(([questions]) => questions).find(q => q.name === 'selectedSkills')
    expect(question.choices).toEqual([
      { name: 'verify-change — Review changes', value: 'verify-change', checked: true },
      { name: 'multi-agent — Coordinate agents', value: 'multi-agent', checked: false },
    ])
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual(['multi-agent'])
  })

  it('leaves the legacy profile implicit when no Skills selection has been configured', async () => {
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig.mock.calls[0][0].performance).not.toHaveProperty('skillsProfile')
    expect(mocks.install.mock.calls[0][3].skillsProfile).toBeUndefined()
  })

  it.each([[undefined], [['verify-change']]])('uses the latest manifest rather than a stale profile %j', async (oldProfile) => {
    mocks.existing.performance.skillsProfile = oldProfile
    mocks.pathExists.mockImplementation(async (path: string) => path.endsWith('/.ccg-skills/manifest.json'))
    mocks.installedNames.mockResolvedValue(['multi-agent'])
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual(['multi-agent'])
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsMode).toBe('native')
    expect(mocks.installedNames).toHaveBeenCalledWith(expect.objectContaining({
      nativeDir: '/tmp/ccg-init-test/skills', storeDir: '/tmp/ccg-init-test/.ccg-skills',
    }))
  })

  it('preserves an empty manifest selection after standalone removals', async () => {
    mocks.existing.performance.skillsProfile = ['verify-change']
    mocks.pathExists.mockImplementation(async (path: string) => path.endsWith('/.ccg-skills/manifest.json'))
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual([])
  })

  it('keeps an explicit legacy choice even if an older native manifest remains', async () => {
    mocks.existing.performance.skillsMode = 'legacy'
    mocks.pathExists.mockImplementation(async (path: string) => path.endsWith('/.ccg-skills/manifest.json'))
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.installedNames).not.toHaveBeenCalled()
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsMode).toBe('legacy')
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toBeUndefined()
  })

  it('refuses a damaged manifest without falling back to old configuration', async () => {
    mocks.pathExists.mockImplementation(async (path: string) => path.endsWith('/.ccg-skills/manifest.json'))
    mocks.installedNames.mockRejectedValueOnce(new Error('Invalid managed skill record'))
    await expect(init({ skipPrompt: true, skipMcp: true })).rejects.toThrow('Invalid managed skill record')
    expect(mocks.writeConfig).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('explicit --skills overrides the manifest selection', async () => {
    mocks.pathExists.mockImplementation(async (path: string) => path.endsWith('/.ccg-skills/manifest.json'))
    mocks.installedNames.mockResolvedValue(['multi-agent'])
    await init({ skipPrompt: true, skipMcp: true, skills: 'none', installDir: '/tmp/ccg-init-test' })
    expect(mocks.installedNames).not.toHaveBeenCalled()
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual([])
  })

  it('persists an explicit interactive legacy choice for later updates', async () => {
    mocks.existing.performance.skillsProfile = ['verify-change']
    answerInitQuestions({ skillsMode: 'legacy' })
    await init({ skipMcp: true, installDir: '/tmp/ccg-init-test' })
    const saved = mocks.writeConfig.mock.calls[0][0]
    expect(saved.performance.skillsMode).toBe('legacy')
    expect(saved.performance.skillsProfile).toBeUndefined()
  })

  it('returns a nonzero exit status and stops configuration side effects after installation fails', async () => {
    mocks.install.mockResolvedValueOnce({ success: false, installedCommands: [], installedPrompts: [], errors: ['Skill conflict'] })
    await init({ skipPrompt: true, installDir: '/tmp/ccg-init-test' })
    expect(process.exitCode).toBe(1)
    expect(mocks.spinnerFailed).toHaveBeenCalled()
    expect(mocks.spinnerSucceeded).not.toHaveBeenCalled()
    expect(mocks.installMcp).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Skill conflict'))
  })

  it.each([[[]], [['verify-change', 'multi-agent']]])('preserves a native Skills selection %j during reinstall', async (skillsProfile) => {
    mocks.existing.performance.skillsProfile = skillsProfile
    await init({ skipPrompt: true, skipMcp: true, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual(skillsProfile)
    expect(mocks.install.mock.calls[0][3].skillsProfile).toEqual(skillsProfile)
  })

  it.each([
    ['none', []],
    ['all', ['verify-change', 'multi-agent']],
    ['multi-agent,verify-change,multi-agent', ['multi-agent', 'verify-change']],
  ])('applies --skills %s without mutating the old profile', async (skills, expected) => {
    mocks.existing.performance.skillsProfile = ['verify-change']
    await init({ skipPrompt: true, skipMcp: true, skills, installDir: '/tmp/ccg-init-test' })
    expect(mocks.writeConfig.mock.calls[0][0].performance.skillsProfile).toEqual(expected)
    expect(mocks.existing.performance.skillsProfile).toEqual(['verify-change'])
  })

  it.each(['', 'unknown-skill', 'all,multi-agent', 'none,all'])('rejects invalid --skills %s before writing configuration', async (skills) => {
    await expect(init({ skipPrompt: true, skipMcp: true, skills })).rejects.toThrow('Invalid Skills selection')
    expect(mocks.writeConfig).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('allows the user to clear the saved model to use the OpenCode default', async () => {
    mocks.prompt.mockResolvedValue({ selectedOpencodeModel: ' ' })
    expect(await promptOpencodeModel('deepseek/custom-test-model', false)).toBe('')
  })
})

describe('OpenCode model input', () => {
  it.each(['', ' ', 'deepseek/test-model', 'custom/model:latest', 'provider/org/model'])('accepts %j', (value) => {
    expect(validateOpencodeModel(value)).toBe(true)
  })
  it.each(['model-only', 'provider/model name', 'provider/model;touch', 'provider/$(id)', 'provider/`id`', 'provider/model\nnext'])('rejects %j', (value) => {
    expect(validateOpencodeModel(value)).not.toBe(true)
  })
})
