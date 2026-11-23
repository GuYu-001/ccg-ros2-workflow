import { homedir, tmpdir } from 'node:os'
import { join as nativeJoin } from 'node:path'
import fs from 'fs-extra'
import { join } from 'pathe'
import { parse as parseToml } from 'smol-toml'
import { initI18n } from '../../i18n'
import cac from 'cac'
import { setupCommands } from '../../cli-setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ccgHookTrustEntries, ccgHooksTrusted, codexHookHash, installedCcgHookTrustEntries, installedHookCommand, mergeCcgHooks, readCcgHookTrust, uninstallCcgCodexHooks } from '../codex-hook-trust'
import { installCodexMode, uninstallCodexMode } from '../installer'
import { PACKAGE_ROOT } from '../installer-template'

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: vi.fn() }
})

let home: string
let codexHome: string
const ccgCommand = () => `python3 ${join(home, '.codex', 'hooks', 'ccg-workflow.py')}`
const userGroup = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user', timeout: 5 }] }
const ccgGroup = () => ({ hooks: [{ type: 'command', command: ccgCommand(), timeout: 10 }] })
const readConfig = async () => parseToml(await fs.readFile(join(codexHome, 'config.toml'), 'utf-8')) as Record<string, any>

beforeEach(async () => {
  home = await fs.mkdtemp(join(tmpdir(), 'ccg-hook-trust-'))
  codexHome = join(home, '.codex')
  vi.mocked(homedir).mockReturnValue(home)
})
afterEach(async () => {
  await fs.remove(home)
})

describe('codexHookHash', () => {
  it('reproduces a complete trust entry reported by codex-cli 0.154.0', () => {
    const dir = '/home/robot/.codex'
    const source = '/private/tmp/codex-source/hooks.json'
    const doc = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', timeout: 10, command: 'python3 /home/robot/.codex/hooks/ccg-workflow.py' }] }] } }
    expect(ccgHookTrustEntries(doc, dir, false, source)).toEqual([{
      key: '/private/tmp/codex-source/hooks.json:user_prompt_submit:0:0',
      hash: 'sha256:1c76eee4ff57c89c91a207235349ef4aae988374910b267649309b39bbc4f359',
    }])
  })
  it('matches the hash codex-cli 0.170.0 reported via hooks/list', () => {
    const handler = { type: 'command', command: 'python3 /Users/li/.tmp-agent/codexhome.me7288co/hook.py', timeout: 10 }
    expect(codexHookHash('user_prompt_submit', handler))
      .toBe('sha256:dd457ececaac7639475f50928b368e457aa3adf8928902419058fa68c9ddd69a')
  })

  it('hashes a missing timeout as Codex default of 600 seconds', () => {
    const base = { type: 'command', command: 'x' }
    expect(codexHookHash('stop', base)).toBe(codexHookHash('stop', { ...base, timeout: 600 }))
    expect(codexHookHash('stop', base)).not.toBe(codexHookHash('stop', { ...base, timeout: 10 }))
  })
})

describe('mergeCcgHooks', () => {
  it('keeps user hooks, upgrades a CCG group in place without changing user trust indexes', () => {
    const existing = { hooks: { UserPromptSubmit: [ccgGroup(), userGroup], PreToolUse: [userGroup] } }
    const merged = mergeCcgHooks(existing, { hooks: { UserPromptSubmit: [ccgGroup()] } }, codexHome)
    expect(merged.hooks.UserPromptSubmit).toEqual([ccgGroup(), userGroup])
    expect(merged.hooks.PreToolUse).toEqual([userGroup])
  })

  it('keys trust by native hooks.json path and position', () => {
    const doc = { hooks: { UserPromptSubmit: [userGroup, ccgGroup()] } }
    const [entry] = ccgHookTrustEntries(doc, codexHome)
    expect(entry.key).toBe(`${nativeJoin(codexHome, 'hooks.json')}:user_prompt_submit:1:0`)
  })
})

describe('trust and registration lifecycle', () => {
  const hooksPath = () => join(codexHome, 'hooks.json')
  const configPath = () => join(codexHome, 'config.toml')
  const provider = '# User configuration\n[model_providers.custom]\nname = "Custom"\n'
  const userState = '[hooks.state."other:stop:0:0"]\nenabled = false\n'
  const stanza = (entry: { key: string, hash: string }) => `[hooks.state.${JSON.stringify(entry.key)}]\ntrusted_hash = "${entry.hash}"\n`

  it.each(['python3 .codex/hooks/ccg-workflow.py', 'python3 ~/.codex/hooks/ccg-workflow.py', 'absolute'])(
    'upgrades the %s command without duplicating or moving mixed user hooks, and trusts only it', async (legacy) => {
      const original = { type: 'command', command: legacy === 'absolute' ? ccgCommand() : legacy, timeout: 10 }
      const user = userGroup.hooks[0]
      const mixed = { hooks: [user, original, user] }
      await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [userGroup, mixed], Stop: [userGroup] } })
      await fs.outputFile(configPath(), provider + userState)
      const installed = await installCodexMode()
      expect(installed).toMatchObject({ success: true, message: expect.stringContaining('[hooks.state]') })
      expect(installed.message).not.toContain('≥ 0.129')
      const merged = await fs.readJson(hooksPath())
      expect(merged.hooks.UserPromptSubmit).toEqual([userGroup, { hooks: [user, ccgGroup().hooks[0], user] }])
      const [entry] = await installedCcgHookTrustEntries(merged, codexHome)
      expect(entry.key).toBe(`${await fs.realpath(hooksPath())}:user_prompt_submit:1:1`)
      // The approval is appended; everything the user wrote is still there byte for byte.
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState + stanza(entry))
      expect(Object.keys((await readConfig()).hooks.state)).toEqual(['other:stop:0:0', entry.key])
      const before = await fs.readFile(hooksPath(), 'utf8')
      expect((await installCodexMode()).success).toBe(true)
      expect(await fs.readFile(hooksPath(), 'utf8')).toBe(before)
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState + stanza(entry))
      expect((await uninstallCodexMode()).success).toBe(true)
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState)
      expect(await fs.readJson(hooksPath())).toEqual({ hooks: { UserPromptSubmit: [userGroup, { hooks: [user, user] }], Stop: [userGroup] } })
    },
  )

  it('re-approves a handler Codex would show as modified, keeping the record where it was', async () => {
    await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/ccg-workflow.py', timeout: 10 }] }] } })
    const key = `${await fs.realpath(hooksPath())}:user_prompt_submit:0:0`
    const record = (hash: string) => `[hooks.state.${JSON.stringify(key)}]\n# approved earlier\ntrusted_hash = "${hash}"\n\n`
    await fs.outputFile(configPath(), record('sha256:old') + provider)
    expect((await installCodexMode()).message).toContain('[hooks.state]')
    const [entry] = await installedCcgHookTrustEntries(await fs.readJson(hooksPath()), codexHome)
    expect(entry.key).toBe(key)
    expect(await fs.readFile(configPath(), 'utf8')).toBe(record(entry.hash) + provider)
  })

  it('drops approvals left under positions a deduplicated handler no longer has', async () => {
    await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [ccgGroup(), userGroup, ccgGroup()] } })
    const old = await installedCcgHookTrustEntries(await fs.readJson(hooksPath()), codexHome)
    expect(old.map(e => e.key.slice(-4))).toEqual([':0:0', ':2:0'])
    const userApproval = stanza({ key: old[0].key.replace(/:0:0$/, ':1:0'), hash: 'sha256:user' })
    await fs.outputFile(configPath(), provider + userApproval + stanza(old[1]))
    expect((await installCodexMode()).message).toContain('[hooks.state]')
    const merged = await fs.readJson(hooksPath())
    expect(merged.hooks.UserPromptSubmit).toEqual([ccgGroup(), userGroup])
    const [entry] = await installedCcgHookTrustEntries(merged, codexHome)
    expect(entry).toEqual(old[0])
    expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userApproval + stanza(entry))
  })

  it('leaves a hook the user disabled in Codex disabled and says so', async () => {
    await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [ccgGroup()] } })
    const [entry] = await installedCcgHookTrustEntries(await fs.readJson(hooksPath()), codexHome)
    const config = `${provider}[hooks.state.${JSON.stringify(entry.key)}]\nenabled = false\n`
    await fs.outputFile(configPath(), config)
    const installed = await installCodexMode()
    expect(installed).toMatchObject({ success: true, message: expect.stringContaining('/hooks') })
    expect(installed.message).not.toContain('[hooks.state]')
    expect(await fs.readFile(configPath(), 'utf8')).toBe(config)
  })

  it.each([
    ['an inline hooks table', 'hooks = { state = {} }\n'],
    ['invalid TOML', 'invalid = "'],
  ])('installs without touching a config.toml written as %s', async (_name, config) => {
    await fs.outputFile(configPath(), config)
    const installed = await installCodexMode()
    expect(installed).toMatchObject({ success: true, message: expect.stringContaining('≥ 0.129') })
    expect(await fs.readFile(configPath(), 'utf8')).toBe(config)
    expect(await fs.readdir(codexHome)).not.toContainEqual(expect.stringContaining('.tmp'))
  })

  it('keeps CRLF line endings and a missing final newline intact', async () => {
    const config = '# windows\r\n[model_providers.custom]\r\nname = "Custom"'
    await fs.outputFile(configPath(), config)
    expect((await installCodexMode()).message).toContain('[hooks.state]')
    const [entry] = await installedCcgHookTrustEntries(await fs.readJson(hooksPath()), codexHome)
    expect(await fs.readFile(configPath(), 'utf8'))
      .toBe(`${config}\r\n[hooks.state.${JSON.stringify(entry.key)}]\r\ntrusted_hash = "${entry.hash}"\r\n`)
  })

  it('writes through a symlinked config.toml instead of replacing the link', async () => {
    const target = join(home, 'dotfiles', 'codex-config.toml')
    await fs.outputFile(target, provider)
    await fs.ensureDir(codexHome)
    await fs.symlink(target, configPath())
    expect((await installCodexMode()).message).toContain('[hooks.state]')
    expect((await fs.lstat(configPath())).isSymbolicLink()).toBe(true)
    const [entry] = await installedCcgHookTrustEntries(await fs.readJson(hooksPath()), codexHome)
    expect(await fs.readFile(target, 'utf8')).toBe(provider + stanza(entry))
    expect((await uninstallCodexMode()).success).toBe(true)
    expect((await fs.lstat(configPath())).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(target, 'utf8')).toBe(provider)
  })

  it('keeps similar user commands and their configuration', async () => {
    const h = ccgGroup().hooks[0]
    const lookalikes = [{ ...h, command: h.command + '.backup' }, { ...h, type: 'other' },
      { ...h, command: 'python3 /other/hooks/ccg-workflow.py' }, { ...h, command: h.command + ' --custom' }]
    const original = { hooks: { UserPromptSubmit: [{ hooks: lookalikes }], PreToolUse: [userGroup] } }
    await fs.outputJson(hooksPath(), original)
    await fs.outputFile(configPath(), provider)
    expect((await installCodexMode()).success).toBe(true)
    const hooks = await fs.readJson(hooksPath())
    expect(hooks.hooks.UserPromptSubmit).toEqual([...original.hooks.UserPromptSubmit, ccgGroup()])
    expect(ccgHookTrustEntries(hooks, codexHome)).toHaveLength(1)
    await uninstallCodexMode()
    expect(await fs.readJson(hooksPath())).toEqual(original)
  })

  it('does not rewrite inline trust state or invalid TOML', async () => {
    const target = { hooks: { UserPromptSubmit: [ccgGroup()] } }
    await fs.outputJson(hooksPath(), target)
    const [entry] = await installedCcgHookTrustEntries(target, codexHome)
    const inline = `hooks = { state = { ${JSON.stringify(entry.key)} = { trusted_hash = "${entry.hash}" } } }\n`
    for (const config of [inline, 'invalid = "']) {
      await fs.outputJson(hooksPath(), target)
      await fs.outputFile(configPath(), config)
      expect(await readCcgHookTrust(codexHome, target)).toBe(config === inline)
      await uninstallCcgCodexHooks(codexHome)
      expect(await fs.readFile(configPath(), 'utf8')).toBe(config)
    }
  })

  it('reads a Windows native key with backslashes and respects disabled hooks', () => {
    const key = String.raw`C:\Users\robot\.codex\hooks.json:user_prompt_submit:1:0`
    const entry = { key, hash: 'sha256:fixture' }
    const config = parseToml(stanza(entry))
    expect(ccgHooksTrusted([entry], config)).toBe(true)
    expect(ccgHooksTrusted([entry], parseToml(stanza(entry) + 'enabled = false'))).toBe(false)
  })

  it('matches the resolved source path without rewriting the command in a symlinked home', async () => {
    const alias = join(home, 'alias')
    await fs.ensureDir(codexHome)
    await fs.symlink(codexHome, alias, 'junction')
    const handler = { type: 'command', command: installedHookCommand(alias), timeout: 10 }
    const doc = { hooks: { UserPromptSubmit: [{ hooks: [handler] }] } }
    await fs.writeJson(hooksPath(), doc)
    expect(await installedCcgHookTrustEntries(doc, alias)).toEqual([{
      key: `${await fs.realpath(hooksPath())}:user_prompt_submit:0:0`, hash: codexHookHash('user_prompt_submit', handler),
    }])
  })

  it('does not silently replace malformed hooks.json', async () => {
    await fs.outputFile(hooksPath(), '{"hooks": []}')
    expect((await installCodexMode()).success).toBe(false)
    expect(await fs.readFile(hooksPath(), 'utf8')).toBe('{"hooks": []}')
    expect(await fs.readdir(codexHome)).toEqual(['hooks.json'])
  })

  it.each(['', '{', '{// comment\n"hooks":{}}', '{"hooks":{"UserPromptSubmit":{}}}'])(
    'finishes uninstall without modifying unreadable hooks.json (%j)', async (bad) => {
      await installCodexMode()
      await fs.writeFile(hooksPath(), bad)
      const result = await uninstallCodexMode()
      expect(result.success).toBe(true)
      expect(result.skipped.join('\n')).toMatch(/hooks\.json.*unchanged.+:/i)
      expect(await fs.readFile(hooksPath(), 'utf8')).toBe(bad)
      expect((await fs.readdir(codexHome)).sort()).toEqual(['config.toml', 'hooks.json'])
      expect((await uninstallCodexMode()).success).toBe(true)
    },
  )

  it('rejects a malformed shipped template before creating any files', async () => {
    const read = vi.spyOn(fs, 'readJson').mockResolvedValueOnce({ hooks: { UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'python3 ~/.codex/hooks/ccg-workflow.py', timeout: 11 }] },
    ] } })
    try {
      expect(await installCodexMode()).toMatchObject({ success: false, message: expect.stringMatching(/template/i) })
      expect(await fs.pathExists(codexHome)).toBe(false)
    }
    finally { read.mockRestore() }
  })

  it('prints skipped files and their reasons in the non-interactive CLI', async () => {
    await fs.outputFile(hooksPath(), '{')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const cli = cac()
      await setupCommands(cli)
      cli.parse(['node', 'ccg', 'codex-mode', 'uninstall'], { run: false })
      await cli.runMatchedCommand()
      const output = log.mock.calls.flat().join('\n')
      expect(output).toMatch(/Skipped: .*hooks\.json unchanged.*:/)
      expect(output).toContain('user settings kept')
    }
    finally { log.mockRestore() }
  })

  it('reports an unreadable trust file separately after successful deregistration', async () => {
    expect((await installCodexMode()).success).toBe(true)
    await fs.remove(configPath())
    await fs.ensureDir(configPath())
    const result = await uninstallCodexMode()
    expect(result.success).toBe(true)
    expect(result.removed).toContain('~/.codex/hooks.json')
    expect(result.skipped.join('\n')).toMatch(/config\.toml.*trust.*:/)
    expect(result.skipped.join('\n')).not.toContain('hooks.json unchanged')
  })

  it('migrates only the exact v3.0.4 array; leaves a mixed array for manual conversion', async () => {
    const old = { event: 'user_prompt_submit', script: 'hooks/ccg-workflow.py', timeout_ms: 10000 }
    await fs.outputJson(hooksPath(), [old, { ...old, script: 'user.py' }])
    expect(await installCodexMode()).toMatchObject({ success: false, message: expect.stringMatching(/back up.*convert/i) })
    expect(await fs.readdir(codexHome)).toEqual(['hooks.json'])
    await fs.outputJson(hooksPath(), [old])
    expect((await installCodexMode()).success).toBe(true)
    expect((await fs.readJson(hooksPath())).hooks.UserPromptSubmit).toEqual([ccgGroup()])
  })

  it.each([true, false])('preserves hooks.json symlink through install and uninstall (shared: %s)', async (shared) => {
    const target = join(home, 'dotfiles', 'hooks.json')
    const groups = shared ? [ccgGroup(), userGroup] : [ccgGroup()]
    await fs.outputJson(target, { hooks: { UserPromptSubmit: groups } })
    await fs.outputFile(configPath(), provider)
    await fs.symlink(target, hooksPath())
    for (const path of [target, configPath()]) await fs.chmod(path, 0o640)
    expect((await installCodexMode()).success).toBe(true)
    expect((await fs.lstat(hooksPath())).isSymbolicLink()).toBe(true)
    expect(Object.keys((await readConfig()).hooks.state)).toEqual([`${await fs.realpath(target)}:user_prompt_submit:0:0`])
    const result = await uninstallCodexMode()
    expect(result.success).toBe(true)
    if (shared) expect(result.removed.join(' ')).toContain('/hooks')
    expect((await fs.lstat(hooksPath())).isSymbolicLink()).toBe(true)
    expect(await fs.readJson(target)).toEqual({ hooks: shared ? { UserPromptSubmit: [userGroup] } : {} })
    if (process.platform !== 'win32') {
      for (const path of [target, configPath()]) expect((await fs.stat(path)).mode & 0o777).toBe(0o640)
    }
  })

  it.each(['python3 .codex/hooks/ccg-ros2-workflow.py', 'duplicate-slash', 'quoted'])(
    'recognizes and upgrades the historical command %s in place', async (form) => {
      const command = form === 'duplicate-slash' ? ccgCommand().replace('/.codex/', '//.codex/')
        : form === 'quoted' ? `python3 "${ccgCommand().slice(8)}"` : form
      await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [
        { hooks: [{ ...ccgGroup().hooks[0], command }] }, userGroup,
      ] } })
      expect((await installCodexMode()).success).toBe(true)
      expect((await fs.readJson(hooksPath())).hooks.UserPromptSubmit).toEqual([ccgGroup(), userGroup])
      expect((await uninstallCodexMode()).success).toBe(true)
      expect((await fs.readJson(hooksPath())).hooks.UserPromptSubmit).toEqual([userGroup])
    },
  )

  it('keeps customized options and matcher on reinstall without auto-trust; removes only its handler on uninstall', async () => {
    const group = { matcher: 'special', hooks: [{ ...ccgGroup().hooks[0], timeout: 30, statusMessage: 'wait' }, ...userGroup.hooks] }
    await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [group] } })
    await fs.outputFile(configPath(), provider)
    expect((await installCodexMode()).message).toContain('/hooks')
    expect((await fs.readJson(hooksPath())).hooks.UserPromptSubmit).toEqual([group])
    expect(await fs.readFile(configPath(), 'utf8')).toBe(provider)
    await uninstallCodexMode()
    expect((await fs.readJson(hooksPath())).hooks.UserPromptSubmit).toEqual([{ ...group, hooks: userGroup.hooks }])
  })

  it('recognizes Windows drive case but never trusts a noncanonical or unquotable command', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    try {
      for (const user of ['Robot', 'Ro%bot', 'Ro!bot']) {
        const dir = `C:/Users/${user}/.codex`
        const doc = { hooks: { UserPromptSubmit: [{ hooks: [{
          type: 'command', command: `python3 ${dir.replace(/^C:/, 'c:')}/hooks/ccg-workflow.py`, timeout: 10,
        }] }] } }
        expect(ccgHookTrustEntries(doc, dir, true)).toHaveLength(user === 'Robot' ? 1 : 0)
        expect(ccgHookTrustEntries(doc, dir)).toHaveLength(0)
      }
    }
    finally { platform.mockRestore() }
  })

  it('uses the installed command for a home with spaces and quotes', () => {
    const dir = join(home, "robot's lab", '.codex')
    const handler = { type: 'command', command: installedHookCommand(dir), timeout: 10 }
    expect(ccgHookTrustEntries({ hooks: { UserPromptSubmit: [{ hooks: [handler] }] } }, dir)).toHaveLength(1)
  })

  it.each(['en', 'zh-CN'] as const)('trusts a fresh hook, says so in %s, and takes the approval back on uninstall', async (lang) => {
    await initI18n(lang)
    const result = await installCodexMode()
    expect(result.success).toBe(true)
    expect(result.message).toContain(lang === 'en' ? 'Trusted the CCG hook' : '记录信任')
    expect(result.message).toContain('/hooks')
    expect(result.message).not.toContain('≥ 0.129')
    const shipped = await fs.readFile(join(PACKAGE_ROOT, 'templates', 'codex', 'config.toml'), 'utf8')
    const hooks = await fs.readJson(hooksPath())
    const [entry] = await installedCcgHookTrustEntries(hooks, codexHome)
    expect(await fs.readFile(configPath(), 'utf8')).toBe(shipped + stanza(entry))
    expect(await readCcgHookTrust(codexHome, hooks)).toBe(true)
    expect((await uninstallCodexMode()).removed).toContainEqual(expect.stringContaining('[hooks.state]'))
    expect(await fs.readFile(configPath(), 'utf8')).toBe(shipped)
    expect(await fs.pathExists(hooksPath())).toBe(false)
  })
})
