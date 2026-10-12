import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateNativeSkills, generateNativeSkillRules } from '../skill-activation'
import { injectHookConfig } from '../installer-template'
import { runSkillsCommand, manageSkillsMenu } from '../../commands/skills'
import inquirer from 'inquirer'

const state = vi.hoisted(() => ({ home: '/uninitialized-ccg-fixture', config: null as any }))
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => state.home }))
vi.mock('../config', () => ({ readCcgConfig: vi.fn(async () => state.config), writeCcgConfig: vi.fn(async (config) => { state.config = config }) }))

let root: string
let installDir: string
let templatesDir: string
let hookPath: string
let original: string
let customRule: string
const templates = join(__dirname, '../../../templates')

async function hookContext(prompt: string) {
  const output = execFileSync(process.execPath, [hookPath], { input: JSON.stringify({ prompt }), encoding: 'utf8' })
  return output ? JSON.parse(output).hookSpecificOutput.additionalContext : ''
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ccg-skill-activation-'))
  root = await fs.realpath(root)
  state.home = root
  state.config = { general: { version: '3.7.0' }, performance: { skillsMode: 'legacy' } }
  installDir = join(root, '.claude')
  templatesDir = join(root, 'source')
  hookPath = join(installDir, 'hooks/ccg/skill-router.js')
  await fs.mkdir(join(installDir, 'hooks/ccg'), { recursive: true })
  await fs.mkdir(join(installDir, 'rules'), { recursive: true })
  await fs.mkdir(join(installDir, 'skills/ccg/domains/architecture'), { recursive: true })
  await fs.mkdir(join(templatesDir, 'quality'), { recursive: true })
  await fs.writeFile(join(templatesDir, 'quality/SKILL.md'), '---\nname: quality\ndescription: fixture skill\n---\nbody\n')
  await fs.writeFile(join(installDir, 'skills/ccg/domains/architecture/caching.md'), 'LEGACY_CACHE_CONTENT')
  await fs.copyFile(join(templates, 'hooks/task-utils.js'), join(installDir, 'hooks/ccg/task-utils.js'))
  const template = await fs.readFile(join(templates, 'hooks/skill-router.js'), 'utf8')
  original = injectHookConfig(template, { routing: { frontend: { primary: 'claude' }, backend: { primary: 'claude' } } }, installDir)
    + '\n// USER_CUSTOM_HOOK: keep this entire body unchanged.\n'
  await fs.writeFile(hookPath, original)
  customRule = 'CUSTOM: Always preserve my comments.\nLegacy: load ~/.claude/skills/ccg/domains/development/python.md\n'
  for (const file of ['ccg-skills.md', 'ccg-skill-routing.md']) await fs.writeFile(join(installDir, 'rules', file), customRule)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

describe('live native skill activation', () => {
  it('switches legacy Hook after standalone install/remove and preserves the custom body', async () => {
    expect(await hookContext('Please explain redis caching')).toContain('LEGACY_CACHE_CONTENT')
    await runSkillsCommand('install', ['quality'], { templatesDir, json: true })
    expect(await hookContext('Please explain redis caching')).toBe('')
    const patched = await fs.readFile(hookPath, 'utf8')
    const withoutData = (text: string) => text.replace(/^\s*const routing = JSON\.parse\(.+\);$/m, '<DATA>')
    expect(withoutData(patched)).toBe(withoutData(original))
    expect(state.config.performance).toEqual({ skillsMode: 'native', skillsProfile: ['quality'] })
    const rulePath = join(installDir, 'rules/ccg-skills.md')
    expect(await fs.readFile(rulePath, 'utf8')).toContain(customRule)
    expect(await fs.readFile(rulePath, 'utf8')).toContain('- /ccg-quality:')
    await runSkillsCommand('remove', ['quality'], { templatesDir, json: true })
    expect(await hookContext('Please explain redis caching')).toBe('')
    const rule = await fs.readFile(rulePath, 'utf8')
    expect(rule).toContain('No optional CCG native skills are selected.')
    expect(rule).not.toContain('- /ccg-quality:')
    expect(rule).toContain(customRule)
    expect(state.config.performance.skillsProfile).toEqual([])
  })
  it('applies checkbox empty selection immediately and keeps exactly one managed block', async () => {
    await runSkillsCommand('install', ['quality'], { templatesDir, json: true })
    vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({ target: 'claude' }).mockResolvedValueOnce({ names: [] })
    await manageSkillsMenu({ templatesDir })
    expect(await hookContext('Please explain redis caching')).toBe('')
    expect(await fs.readdir(join(installDir, 'skills'))).toEqual(['ccg'])
    const rule = await fs.readFile(join(installDir, 'rules/ccg-skills.md'), 'utf8')
    expect(rule.split('CCG_NATIVE_SKILLS_START')).toHaveLength(2)
    expect(rule).toContain(customRule)
  })
  it('preserves an old Hook and emits reinit notes on stderr without contaminating JSON', async () => {
    const old = '// old user hook\nprocess.exit(0);\n'
    await fs.writeFile(hookPath, old)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await runSkillsCommand('install', ['quality'], { templatesDir, json: true })
    expect(await fs.readFile(hookPath, 'utf8')).toBe(old)
    expect(error.mock.calls.flat().join(' ')).toContain('ccg init')
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0])).toMatchObject({ count: 1 })
  })
  it('does not rewrite external rule symlinks or malformed managed rule blocks', async () => {
    const external = join(root, 'external.md')
    await fs.writeFile(external, 'external user rule')
    const first = join(installDir, 'rules/ccg-skills.md')
    await fs.unlink(first)
    await fs.symlink(external, first)
    let notes = await activateNativeSkills({ installDir, names: ['quality'] })
    expect(notes.join(' ')).toContain('plain managed')
    expect(await fs.readFile(external, 'utf8')).toBe('external user rule')
    await fs.unlink(first)
    await fs.writeFile(first, '<!-- CCG_NATIVE_SKILLS_START -->\nuser edited incomplete block')
    notes = await activateNativeSkills({ installDir, names: [] })
    expect(notes.join(' ')).toContain('Malformed')
    expect(await fs.readFile(first, 'utf8')).toContain('user edited incomplete block')
  })
  it('makes no framework files for standalone skills and rejects duplicate rule selections', async () => {
    const standalone = join(root, 'standalone')
    await fs.mkdir(standalone)
    expect(await activateNativeSkills({ installDir: standalone, names: [] })).toEqual([])
    expect(await fs.readdir(standalone)).toEqual([])
    expect(() => generateNativeSkillRules(['quality', 'quality'], installDir)).toThrow('unique')
  })
})
