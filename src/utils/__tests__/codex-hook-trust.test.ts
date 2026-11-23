import { homedir, tmpdir } from 'node:os'
import { join as nativeJoin } from 'node:path'
import fs from 'fs-extra'
import { join } from 'pathe'
import { parse as parseToml } from 'smol-toml'
import { initI18n } from '../../i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ccgHookTrustEntries, ccgHooksTrusted, codexHookHash, installedCcgHookTrustEntries, installedHookCommand, mergeCcgHooks, readCcgHookTrust, uninstallCcgCodexHooks } from '../codex-hook-trust'
import { installCodexMode, uninstallCodexMode } from '../installer'

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
    'upgrades the %s command without duplicating or moving mixed user hooks', async (legacy) => {
      const original = { type: 'command', command: legacy === 'absolute' ? ccgCommand() : legacy, timeout: 10 }
      const user = userGroup.hooks[0]
      const mixed = { hooks: [user, original, user] }
      await fs.outputJson(hooksPath(), { hooks: { UserPromptSubmit: [userGroup, mixed], Stop: [userGroup] } })
      await fs.outputFile(configPath(), provider + userState)
      const installed = await installCodexMode()
      expect(installed).toMatchObject({ success: true, message: expect.stringContaining('≥ 0.129') })
      const merged = await fs.readJson(hooksPath())
      expect(merged.hooks.UserPromptSubmit).toEqual([userGroup, { hooks: [user, ccgGroup().hooks[0], user] }])
      const [entry] = await installedCcgHookTrustEntries(merged, codexHome)
      expect(entry.key).toBe(`${await fs.realpath(hooksPath())}:user_prompt_submit:1:1`)
      const before = await fs.readFile(hooksPath(), 'utf8')
      expect((await installCodexMode()).success).toBe(true)
      expect(await fs.readFile(hooksPath(), 'utf8')).toBe(before)
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState)
      // Model a decision that the user made in Codex.
      await fs.appendFile(configPath(), stanza(entry))
      expect((await installCodexMode()).message).not.toContain('≥ 0.129')
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState + stanza(entry))
      expect((await uninstallCodexMode()).success).toBe(true)
      expect(await fs.readFile(configPath(), 'utf8')).toBe(provider + userState)
      expect(await fs.readJson(hooksPath())).toEqual({ hooks: { UserPromptSubmit: [userGroup, { hooks: [user, user] }], Stop: [userGroup] } })
    },
  )

  it('keeps similar user commands and their configuration', async () => {
    const h = ccgGroup().hooks[0]
    const lookalikes = [{ ...h, command: h.command + '.backup' }, { ...h, type: 'other' }, { ...h, timeout: 30 }]
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
  })

  it('uses the installed command for a home with spaces and quotes', () => {
    const dir = join(home, "robot's lab", '.codex')
    const handler = { type: 'command', command: installedHookCommand(dir), timeout: 10 }
    expect(ccgHookTrustEntries({ hooks: { UserPromptSubmit: [{ hooks: [handler] }] } }, dir)).toHaveLength(1)
  })

  it.each(['en', 'zh-CN'] as const)('explains how to approve a fresh hook in %s', async (lang) => {
    await initI18n(lang)
    const result = await installCodexMode()
    expect(result.success).toBe(true)
    expect(result.message).toContain(lang === 'en' ? 'skips untrusted hooks' : '跳过未信任的 hook')
    expect(result.message).toContain('/hooks')
    expect((await readConfig()).hooks).toBeUndefined()
    await uninstallCcgCodexHooks(codexHome)
    expect(await fs.pathExists(hooksPath())).toBe(false)
  })
})
