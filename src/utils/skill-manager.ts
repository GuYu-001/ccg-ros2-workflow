import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { version as packageVersion } from '../../package.json'
import { PACKAGE_ROOT } from './installer-template'
import { atomicJson, contained, linkedTarget, plainDirectory, prepareSnapshot, readTree, statMaybe, treeDigest } from './skill-manager-files'
import { collectNativeSkills } from './skill-registry'
import type { SkillMeta } from './skill-registry'

export type SkillTarget = 'claude' | 'codex'
export interface SkillManagerOptions {
  target?: SkillTarget
  templatesDir?: string
  nativeDir?: string
  storeDir?: string
  version?: string
}
export interface ManagedSkill {
  name: string
  alias: string
  target: string
  snapshot: string
  digest: string
  version: string
}
export interface SkillManifest {
  schemaVersion: 1
  target: SkillTarget
  nativeDir: string
  selectionMode: 'native'
  skills: ManagedSkill[]
}
export interface SkillListEntry {
  name: string
  alias: string
  description: string
  category: string
  installed: boolean
  healthy: boolean
  version?: string
  path?: string
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DIGEST = /^[a-f0-9]{64}$/
export const SKILL_MANIFEST_FILE = 'manifest.json'

export function resolveSkillPaths(options: SkillManagerOptions = {}) {
  const target = options.target ?? 'claude'
  if (target !== 'claude' && target !== 'codex') throw new Error(`Unsupported skill target: ${target}`)
  const home = target === 'claude' ? join(homedir(), '.claude') : join(homedir(), '.agents')
  const paths = {
    target,
    templatesDir: options.templatesDir ?? join(PACKAGE_ROOT, 'templates', 'skills'),
    nativeDir: options.nativeDir ?? join(home, 'skills'),
    storeDir: options.storeDir ?? join(home, '.ccg-skills'),
    version: options.version ?? packageVersion,
  }
  for (const path of [paths.templatesDir, paths.nativeDir, paths.storeDir]) {
    if (!isAbsolute(path) || dirname(resolve(path)) === resolve(path)) throw new Error(`Absolute non-root skill path required: ${path}`)
  }
  return paths
}

export function getSkillCatalog(options: SkillManagerOptions = {}): SkillMeta[] {
  return collectNativeSkills(resolveSkillPaths(options).templatesDir)
}

async function canonicalPaths(options: SkillManagerOptions, create: boolean) {
  const paths = resolveSkillPaths(options)
  paths.templatesDir = await plainDirectory(paths.templatesDir)
  paths.nativeDir = await plainDirectory(paths.nativeDir)
  paths.storeDir = await plainDirectory(paths.storeDir)
  const dirs = [paths.templatesDir, paths.nativeDir, paths.storeDir]
  for (let i = 0; i < dirs.length; i++) {
    for (let j = i + 1; j < dirs.length; j++) {
      if (contained(dirs[i], dirs[j]) || contained(dirs[j], dirs[i])) throw new Error('Skill source, native directory and store must be separate')
    }
  }
  if (create) {
    await plainDirectory(paths.nativeDir, true)
    await plainDirectory(paths.storeDir, true)
  }
  return paths
}
type Paths = ReturnType<typeof resolveSkillPaths>

function emptyManifest(paths: Paths): SkillManifest {
  return { schemaVersion: 1, target: paths.target, nativeDir: paths.nativeDir, selectionMode: 'native', skills: [] }
}

function validateRecord(value: ManagedSkill, paths: Paths): void {
  if (!value || typeof value.name !== 'string' || !SLUG.test(value.name) || value.alias !== `ccg-${value.name}`
    || !DIGEST.test(value.snapshot) || !DIGEST.test(value.digest) || typeof value.version !== 'string'
    || typeof value.target !== 'string' || !isAbsolute(value.target)) throw new Error('Invalid managed skill record')
  const snapshotRoot = join(paths.storeDir, 'snapshots', value.snapshot)
  if (value.target === snapshotRoot || !contained(snapshotRoot, value.target)) throw new Error('Managed skill target escapes its snapshot')
  if (value.target !== join(snapshotRoot, 'entries', value.name)) throw new Error('Invalid managed skill entry target')
}

async function readManifest(paths: Paths): Promise<SkillManifest> {
  const path = join(paths.storeDir, SKILL_MANIFEST_FILE)
  const stat = await statMaybe(path)
  if (!stat) return emptyManifest(paths)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid skill manifest: ${path}`)
  const value = JSON.parse(await fs.readFile(path, 'utf8')) as SkillManifest
  if (!value || value.schemaVersion !== 1 || value.target !== paths.target || value.nativeDir !== paths.nativeDir
    || value.selectionMode !== 'native' || !Array.isArray(value.skills)) throw new Error(`Invalid skill manifest: ${path}`)
  const names = new Set<string>()
  for (const record of value.skills) {
    validateRecord(record, paths)
    if (names.has(record.name)) throw new Error('Duplicate managed skill record')
    names.add(record.name)
  }
  return value
}

async function aliasMatches(paths: Paths, record: ManagedSkill): Promise<boolean> {
  const path = join(paths.nativeDir, record.alias)
  const stat = await statMaybe(path)
  return !!stat?.isSymbolicLink() && linkedTarget(path, await fs.readlink(path)) === record.target
}

async function cacheMatches(paths: Paths, record: ManagedSkill): Promise<boolean> {
  try {
    await plainDirectory(join(paths.storeDir, 'snapshots'))
    const root = join(paths.storeDir, 'snapshots', record.snapshot)
    await plainDirectory(root)
    return treeDigest(await readTree(root)) === record.digest
  }
  catch { return false }
}

/** Includes records from older catalogs so missing/deprecated skills remain removable. */
export async function listSkills(options: SkillManagerOptions = {}): Promise<SkillListEntry[]> {
  const paths = await canonicalPaths(options, false)
  const catalog = getSkillCatalog(paths)
  const manifest = await readManifest(paths)
  const names = new Set([...catalog.map(s => s.name), ...manifest.skills.map(s => s.name)])
  const health = new Map<string, Promise<boolean>>()
  return Promise.all([...names].sort().map(async (name) => {
    const skill = catalog.find(s => s.name === name)
    const record = manifest.skills.find(s => s.name === name)
    if (record && !health.has(record.snapshot)) health.set(record.snapshot, cacheMatches(paths, record))
    return {
      name, alias: `ccg-${name}`, description: skill?.description ?? '(not in current catalog)', category: skill?.category ?? 'retired',
      installed: !!record, healthy: record ? await aliasMatches(paths, record) && await health.get(record.snapshot)! : true,
      ...(record && { version: record.version, path: join(paths.nativeDir, record.alias) }),
    }
  }))
}

export async function installedNames(options: SkillManagerOptions = {}): Promise<string[]> {
  return (await readManifest(await canonicalPaths(options, false))).skills.map(s => s.name).sort()
}

function validateNames(names: string[]): void {
  if (!Array.isArray(names) || names.some(n => typeof n !== 'string' || !SLUG.test(n))) throw new Error('Skill names must be catalog slugs')
  if (new Set(names).size !== names.length) throw new Error('Duplicate skill selection')
}

async function withLock<T>(paths: Paths, operation: () => Promise<T>): Promise<T> {
  const path = join(paths.storeDir, 'write.lock')
  let lock
  try { lock = await fs.open(path, 'wx', 0o600) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Skills manager busy; lock preserved: ${path}`)
    throw error
  }
  try {
    await lock.writeFile(`${process.pid}\n`)
    return await operation()
  }
  finally {
    const ours = await lock.stat()
    await lock.close()
    const current = await statMaybe(path)
    if (current?.ino === ours.ino && current.dev === ours.dev) await fs.unlink(path)
  }
}

async function assertOwnership(paths: Paths, manifest: SkillManifest): Promise<void> {
  for (const record of manifest.skills) {
    if (!await aliasMatches(paths, record)) throw new Error(`Managed skill alias changed; preserved: ${record.alias}`)
  }
}

async function assertManifestUnchanged(paths: Paths, previous: SkillManifest): Promise<void> {
  if (JSON.stringify(await readManifest(paths)) !== JSON.stringify(previous)) throw new Error('Skill manifest changed concurrently; preserved')
}

/** Replace only previously verified symlinks. Roll back our links if a later step fails. */
async function applyManifest(paths: Paths, previous: SkillManifest, next: SkillManifest): Promise<void> {
  const changed: { old?: ManagedSkill, next?: ManagedSkill }[] = []
  const all = new Set([...previous.skills.map(s => s.name), ...next.skills.map(s => s.name)])
  try {
    await assertManifestUnchanged(paths, previous)
    for (const name of all) {
      await plainDirectory(paths.nativeDir)
      await plainDirectory(paths.storeDir)
      const old = previous.skills.find(s => s.name === name)
      const record = next.skills.find(s => s.name === name)
      if (old?.target === record?.target) continue
      const path = join(paths.nativeDir, `ccg-${name}`)
      if (old && !await aliasMatches(paths, old)) throw new Error(`Managed skill alias changed; preserved: ${path}`)
      if (!old && await statMaybe(path)) throw new Error(`Unmanaged skill conflict; preserved: ${path}`)
      if (old) await fs.unlink(path)
      changed.push({ old, next: record })
      if (record) await fs.symlink(record.target, path, process.platform === 'win32' ? 'junction' : 'dir')
    }
    await plainDirectory(paths.storeDir)
    await assertManifestUnchanged(paths, previous)
    await assertOwnership(paths, next)
    await atomicJson(join(paths.storeDir, SKILL_MANIFEST_FILE), next)
  }
  catch (error) {
    for (const item of changed.reverse()) {
      const name = (item.old ?? item.next)!.name
      const path = join(paths.nativeDir, `ccg-${name}`)
      if (item.next && await aliasMatches(paths, item.next)) await fs.unlink(path)
      if (item.old && !await statMaybe(path)) await fs.symlink(item.old.target, path, process.platform === 'win32' ? 'junction' : 'dir')
    }
    throw error
  }
}

type Action = 'install' | 'update' | 'remove' | 'sync'
async function mutate(action: Action, requested: string[], options: SkillManagerOptions): Promise<string[]> {
  validateNames(requested)
  const paths = await canonicalPaths(options, true)
  return withLock(paths, async () => {
    const previous = await readManifest(paths)
    await assertOwnership(paths, previous)
    const names = action === 'update' ? previous.skills.map(s => s.name) : requested
    const catalog = action === 'remove' ? [] : getSkillCatalog(paths)
    if (action !== 'remove') {
      for (const name of names) {
        if (!catalog.some(s => s.name === name)) throw new Error(`Unknown skill: ${name}`)
        const old = previous.skills.find(s => s.name === name)
        if (old && !await cacheMatches(paths, old)) throw new Error(`Modified skill cache preserved: ${name}`)
        if (!old && await statMaybe(join(paths.nativeDir, `ccg-${name}`))) throw new Error(`Unmanaged skill conflict; preserved: ccg-${name}`)
      }
    }
    else if (names.some(n => !previous.skills.some(s => s.name === n))) throw new Error('Only managed skills can be removed')
    const keep = action === 'sync' || action === 'update' ? [] : previous.skills.filter(s => !names.includes(s.name))
    const snapshot = action !== 'remove' && names.length ? await prepareSnapshot(paths.storeDir, paths.templatesDir, paths.version, catalog) : null
    const added = snapshot ? names.map((name) => {
      return { name, alias: `ccg-${name}`, target: join(snapshot.root, 'entries', name), snapshot: snapshot.key, digest: snapshot.digest, version: paths.version }
    }) : []
    const next = { ...emptyManifest(paths), skills: [...keep, ...added].sort((a, b) => a.name.localeCompare(b.name)) }
    await applyManifest(paths, previous, next)
    return next.skills.map(s => s.name)
  })
}

export function installSkills(names: string[], options: SkillManagerOptions = {}) { return mutate('install', names, options) }
export function updateSkills(options: SkillManagerOptions = {}) { return mutate('update', [], options) }
export function removeSkills(names: string[], options: SkillManagerOptions = {}) { return mutate('remove', names, options) }
export function syncSkills(options: SkillManagerOptions & { names: string[] }) { return mutate('sync', options.names, options) }
