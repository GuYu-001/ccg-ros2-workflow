import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cac } from 'cac'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSkillCommands, runSkillsCommand } from '../../commands/skills'
import type { SkillCommandOptions } from '../../commands/skills'

let root: string
let options: SkillCommandOptions
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'ccg-skills-command-'))
  root = await fs.realpath(root)
  options = { json: true, target: 'codex', templatesDir: join(root, 'templates'), nativeDir: join(root, 'native'), storeDir: join(root, 'store') }
  await fs.mkdir(join(options.templatesDir!, 'example'), { recursive: true })
  await fs.writeFile(join(options.templatesDir!, 'example/SKILL.md'), '---\nname: example\ndescription: example help\n---\nbody\n')
})
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

describe('skills command', () => {
  it('exposes discoverable command flags', () => {
    const cli = cac('fixture')
    registerSkillCommands(cli)
    const command = cli.commands.find(c => c.name === 'skills')!
    expect(command).toBeDefined()
    expect(command.options.map(o => o.name)).toEqual(expect.arrayContaining(['target', 'json', 'installed']))
  })
  it('prints clean JSON catalog and installation/list/removal counts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runSkillsCommand('catalog', [], options)
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject([{ name: 'example', alias: 'ccg-example' }])
    await runSkillsCommand('install', ['example'], options)
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({ target: 'codex', selected: ['example'], count: 1 })
    await runSkillsCommand('list', [], { ...options, installed: true })
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject([{ name: 'example', installed: true, healthy: true }])
    await runSkillsCommand('remove', ['example'], options)
    expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({ selected: [], count: 0 })
  })
  it.each(['bad', 'install', 'remove'])('rejects invalid or incomplete action %s', async (action) => {
    await expect(runSkillsCommand(action, [], options)).rejects.toThrow()
  })
  it('rejects names for read-only/update actions and unknown target before writing', async () => {
    await expect(runSkillsCommand('update', ['example'], options)).rejects.toThrow('does not accept')
    await expect(runSkillsCommand('catalog', [], { ...options, target: 'invalid' as 'codex' })).rejects.toThrow('Unsupported')
  })
})
