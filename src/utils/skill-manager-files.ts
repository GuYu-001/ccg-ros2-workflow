import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { SkillMeta } from './skill-registry'

export interface TreeFile { path: string, data: Buffer, mode: number }
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store'])
const COMMONJS_BOUNDARY = '{"type":"commonjs"}\n'

export function contained(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export async function statMaybe(path: string) {
  try { return await fs.lstat(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Resolve ancestor aliases once; refuse an alias at the actual managed root. */
export async function plainDirectory(path: string, create = false): Promise<string> {
  const stat = await statMaybe(path)
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Not a plain directory: ${path}`)
  if (!stat && create) await fs.mkdir(path, { recursive: true })
  if (stat || create) return fs.realpath(path)
  const parent = dirname(path)
  if (parent === path) throw new Error(`Invalid directory: ${path}`)
  return join(await plainDirectory(parent), relative(parent, path))
}

export async function readTree(root: string): Promise<TreeFile[]> {
  const files: TreeFile[] = []
  async function walk(dir: string): Promise<void> {
    for (const name of (await fs.readdir(dir)).sort()) {
      if (SKIP.has(name)) continue
      const full = join(dir, name)
      if (relative(root, full).split(sep).slice(0, 2).join('/') === 'domains/security') continue
      const stat = await fs.lstat(full)
      if (stat.isSymbolicLink()) throw new Error(`Template symlink is not supported: ${full}`)
      if (stat.isDirectory()) await walk(full)
      else if (stat.isFile()) files.push({ path: relative(root, full), data: await fs.readFile(full), mode: stat.mode & 0o777 })
      else throw new Error(`Unsupported template entry: ${full}`)
    }
  }
  await walk(root)
  return files
}

export function treeDigest(files: TreeFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(JSON.stringify([file.path.split(sep).join('/'), file.data.length])).update(file.data)
  }
  return hash.digest('hex')
}

function renderFile(file: TreeFile, root: string, catalog: SkillMeta[]): TreeFile {
  if (!file.path.endsWith('.md')) return file
  let text = file.data.toString('utf8').replaceAll('~/.claude/skills/ccg', root).replaceAll('~/.agents/skills/ccg', root)
  const skill = catalog.find(s => join(s.relPath, 'SKILL.md') === file.path)
  if (skill) text = text.replace(/^(---\r?\n[\s\S]*?)^name:.*$/m, `$1name: ccg-${skill.name}`)
  // References between Impeccable skills must use the managed namespace too.
  text = text.replace(/(^|[\s`])(\/)(?!ccg-)([a-z][a-z-]+)(?=[\s`.,;:]|$)/gm, (all, prefix: string, _slash: string, name: string) =>
    catalog.some(s => s.name === name) ? `${prefix}/ccg-${name}` : all)
  return { ...file, data: Buffer.from(text) }
}

function snapshotFiles(raw: TreeFile[], root: string, catalog: SkillMeta[]): TreeFile[] {
  const treeRoot = join(root, 'tree')
  const content = raw
  const rendered = content.map(file => ({ ...file, path: join('tree', file.path) }))
  // Keep CommonJS helper scripts executable even when the source lives in an ESM package.
  if (!content.some(file => file.path === 'package.json')) {
    rendered.push({ path: join('tree', 'package.json'), data: Buffer.from(COMMONJS_BOUNDARY), mode: 0o644 })
  }
  // A native entry contains only metadata/instructions. Nested source SKILL.md
  // files remain outside discovery, and scripts keep their real relative layout.
  for (const skill of catalog) {
    const original = renderFile(content.find(file => file.path === join(skill.relPath, 'SKILL.md'))!, treeRoot, catalog)
    const sourceDir = join(treeRoot, skill.relPath)
    const instructions = `\n\n## Resource directory\n\nThe resources for this skill are in \`${sourceDir}\`. Resolve all relative scripts, references and files from that directory; use their absolute paths when running commands. The native entry directory contains only this instruction file.\n`
    let text = original.data.toString('utf8').replace(/^(---\r?\n[\s\S]*?\r?\n---)/, `$1${instructions}`)
    for (const macro of ['${CLAUDE_SKILL_DIR}', '${CODEX_SKILL_DIR}', '${SKILL_DIR}', '{{SKILL_DIR}}']) {
      text = text.replaceAll(macro, sourceDir)
    }
    rendered.push({ path: join('entries', skill.name, 'SKILL.md'), data: Buffer.from(text), mode: 0o644 })
  }
  return rendered
}

export async function prepareSnapshot(store: string, source: string, version: string, catalog: SkillMeta[]) {
  const raw = await readTree(source)
  const key = createHash('sha256')
    .update(`native-entries-v3\0${COMMONJS_BOUNDARY}\0${version}\0${treeDigest(raw)}`).digest('hex')
  const parent = await plainDirectory(join(store, 'snapshots'), true)
  const root = join(parent, key)
  const rendered = snapshotFiles(raw, root, catalog)
  const digest = treeDigest(rendered)
  if (await statMaybe(root)) {
    await plainDirectory(root)
    if (treeDigest(await readTree(root)) !== digest) throw new Error(`Modified skill cache preserved: ${root}`)
    return { key, root, digest }
  }
  const temp = await fs.mkdtemp(join(parent, '.pending-'))
  try {
    for (const file of rendered) {
      const path = join(temp, file.path)
      await fs.mkdir(dirname(path), { recursive: true })
      await fs.writeFile(path, file.data, { mode: file.mode })
    }
    await fs.rename(temp, root)
  }
  finally { await fs.rm(temp, { recursive: true, force: true }) }
  return { key, root, digest }
}

export async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await fs.rename(temp, path)
  }
  finally { await fs.rm(temp, { force: true }) }
}

export function linkedTarget(link: string, raw: string): string {
  return resolve(dirname(link), raw)
}
