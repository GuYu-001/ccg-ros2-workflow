import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { plainDirectory, statMaybe } from './skill-manager-files'

const START = '<!-- CCG_NATIVE_SKILLS_START -->'
const END = '<!-- CCG_NATIVE_SKILLS_END -->'
const DATA_LINE = /^(\s*const routing = JSON\.parse\()("(?:\\.|[^"\\])*")(\);?[^\S\r\n]*)$/gm
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The block qualifies obsolete legacy instructions without discarding user rules. */
export function generateNativeSkillRules(names: string[], installDir: string): string {
  if (names.some(name => !SLUG.test(name)) || new Set(names).size !== names.length)
    throw new Error('Native rule selections must be unique catalog slugs')
  return [
    START,
    '# CCG Native Skills', '',
    'Current CCG Skills mode: native.',
    'Use only host-discovered ccg-* skills in the current selection below. An empty selection enables no optional skills.',
    'Legacy CCG language/domain routing and automatic gate requirements apply only in legacy mode, which is inactive here.',
    'In particular, do not require old skills/ccg knowledge files or old /ccg:* skill commands from other sections of this file.',
    'Previous CCG skill lists in this file are superseded by this selection. Preserve other project and user instructions.',
    'Load a selected skill on demand and use the canonical resource directory stated in its instructions.',
    'Run an automatic quality gate only if that skill is available. Otherwise use project test, build and review commands.', '',
    ...names.map(name => `- /ccg-${name}: ${join(installDir, 'skills', `ccg-${name}`, 'SKILL.md')}`),
    ...(names.length ? [] : ['No optional CCG native skills are selected.']),
    '', 'Manage the selection with ccg skills list/install/update/remove.',
    END,
  ].join('\n')
}

function patchRuleBlock(text: string, block: string): string {
  const starts = text.split(START).length - 1
  const ends = text.split(END).length - 1
  if (!starts && !ends) return `${block}\n\n${text}`
  if (starts !== 1 || ends !== 1 || text.indexOf(END) < text.indexOf(START))
    throw new Error('Malformed native rule block; custom text preserved')
  const start = text.indexOf(START)
  const end = text.indexOf(END) + END.length
  return `${text.slice(0, start)}${block}${text.slice(end)}`
}

function patchHook(text: string): string {
  const matches = [...text.matchAll(DATA_LINE)]
  if (matches.length !== 1) throw new Error('This Hook has no unique CCG 3.7 data line; run ccg init to refresh it')
  const match = matches[0]
  const value = JSON.parse(JSON.parse(match[2])) as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.installDir !== 'string')
    throw new Error('Invalid Hook data; custom body preserved. Run ccg init to refresh it')
  value.nativeSkills = true
  const line = `${match[1]}${JSON.stringify(JSON.stringify(value))}${match[3]}`
  return `${text.slice(0, match.index!)}${line}${text.slice(match.index! + match[0].length)}`
}

async function updateText(path: string, transform: (text: string) => string): Promise<void> {
  const stat = await statMaybe(path)
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`Not a plain managed text file: ${path}`)
  const before = stat ? await fs.readFile(path, 'utf8') : ''
  const next = transform(before)
  if (next === before) return
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, next, { flag: 'wx', mode: stat ? stat.mode & 0o777 : 0o600 })
    const current = await statMaybe(path)
    if (stat ? !current?.isFile() || current.isSymbolicLink() || current.ino !== stat.ino
      || await fs.readFile(path, 'utf8') !== before : !!current) throw new Error(`Concurrent change preserved: ${path}`)
    await fs.rename(temp, path)
  }
  finally { await fs.rm(temp, { force: true }) }
}

/** Refresh only the installed framework's data and managed rule blocks, never its custom Hook body. */
export async function activateNativeSkills(options: { installDir: string, names: string[] }): Promise<string[]> {
  const { installDir, names } = options
  if (!isAbsolute(installDir) || dirname(installDir) === installDir) throw new Error('Absolute framework directory required')
  const notes: string[] = []
  const hookDir = join(installDir, 'hooks', 'ccg')
  const rulesDir = join(installDir, 'rules')
  const hook = join(hookDir, 'skill-router.js')
  if (!await statMaybe(hook) && !await statMaybe(rulesDir)) return notes // Standalone skills need no framework.
  try {
    await plainDirectory(installDir)
    await plainDirectory(hookDir)
    if (!await statMaybe(hook)) notes.push('CCG skill routing Hook is absent; run ccg init to refresh it.')
    else await updateText(hook, patchHook)
  }
  catch (error) { notes.push(`CCG skill routing refresh: ${(error as Error).message}`) }
  try {
    const block = generateNativeSkillRules(names, installDir)
    await plainDirectory(installDir)
    await plainDirectory(rulesDir, true)
    for (const name of ['ccg-skills.md', 'ccg-skill-routing.md'])
      await updateText(join(rulesDir, name), text => patchRuleBlock(text, block))
  }
  catch (error) { notes.push(`CCG native rule refresh: ${(error as Error).message}`) }
  return notes
}
