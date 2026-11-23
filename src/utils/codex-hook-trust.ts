import { createHash, randomUUID } from 'node:crypto'
// node:path, not pathe: Codex keys trust by the native path (backslashes on Windows).
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import fs from 'fs-extra'
import { parse } from 'smol-toml'

/**
 * Codex hook trust (codex-cli ≥ 0.129).
 *
 * Codex only runs a non-managed hook after the user has reviewed it in `/hooks`.
 * The approval is stored in config.toml as
 *
 *   [hooks.state."<hooks.json path>:<event>:<group>:<handler>"]
 *   trusted_hash = "sha256:<hex>"
 *
 * An untrusted hook is skipped, and in `codex exec` the skip prints nothing at
 * all. Installation registers the hook; approval stays in Codex's /hooks UI.
 *
 * The hash mirrors codex-rs `hook_hash`: sha256 over key-sorted compact JSON of
 * `{event_name, matcher?, hooks: [normalized handler]}`. Verified against
 * `hooks/list` on codex-cli 0.154.0 and 0.170.0. If a later Codex changes normalization the
 * hook shows as "modified" and the user can review it again in `/hooks`.
 */

const CCG_HOOK_SCRIPT = 'ccg-workflow.py'
const DEFAULT_TIMEOUT_SEC = 600

type Json = Record<string, any>
export type CcgHookTrust = { key: string, hash: string }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Json).sort()
      .filter(k => (value as Json)[k] !== undefined && (value as Json)[k] !== null)
      .map(k => `${JSON.stringify(k)}:${canonical((value as Json)[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export function codexHookHash(eventLabel: string, handler: Json): string {
  const timeout = typeof handler.timeout === 'number' ? Math.max(1, handler.timeout) : DEFAULT_TIMEOUT_SEC
  const normalized = {
    type: 'command',
    command: handler.command,
    timeout,
    async: handler.async === true,
    statusMessage: handler.statusMessage,
  }
  const identity = canonical({ event_name: eventLabel, hooks: [normalized] })
  return `sha256:${createHash('sha256').update(identity).digest('hex')}`
}

function scriptPath(codexHome: string) {
  return join(codexHome, 'hooks', CCG_HOOK_SCRIPT).replaceAll('\\', '/')
}

export function installedHookCommand(codexHome: string): string {
  const path = scriptPath(codexHome)
  if (/^[\w./:-]+$/.test(path)) return `python3 ${path}`
  if (process.platform === 'win32') {
    if (/[%!"\r\n]/.test(path)) throw new Error('Cannot safely quote the Codex hook path')
    return `python3 "${path}"`
  }
  return `python3 '${path.replaceAll("'", "'\\''")}'`
}

// Only the shipped handler is ours. Legacy relative paths are removable but
// never approved; a different command that mentions the script is user-owned.
function isCcgHandler(h: Json, codexHome: string, legacy: boolean): boolean {
  if (h?.type !== 'command' || h.timeout !== 10 || Object.keys(h).some(k => !['type', 'command', 'timeout'].includes(k))) return false
  return h.command === installedHookCommand(codexHome) || (legacy && [
    'python3 .codex/hooks/ccg-workflow.py', 'python3 ~/.codex/hooks/ccg-workflow.py',
    `python3 ${scriptPath(codexHome)}`,
  ].includes(h.command))
}

export function ccgHookTrustEntries(doc: Json, codexHome: string, legacy = false, sourcePath = join(codexHome, 'hooks.json')): CcgHookTrust[] {
  const groups = doc.hooks?.UserPromptSubmit
  if (!Array.isArray(groups)) return []
  const label = 'user_prompt_submit'
  return groups.flatMap((group: Json, g: number) => {
    if (!Array.isArray(group?.hooks) || Object.keys(group).some(k => k !== 'hooks')) return []
    return group.hooks.flatMap((h: Json, i: number) => isCcgHandler(h, codexHome, legacy)
      ? [{ key: `${sourcePath}:${label}:${g}:${i}`, hash: codexHookHash(label, h) }] : [])
  })
}

// Codex resolves the source path (e.g. /tmp -> /private/tmp on macOS), but
// hashes the command text exactly as registered, including any path alias.
export async function installedCcgHookTrustEntries(doc: Json, codexHome: string, legacy = false): Promise<CcgHookTrust[]> {
  const source = await fs.realpath(join(codexHome, 'hooks.json')).catch(() => null)
  return source ? ccgHookTrustEntries(doc, codexHome, legacy, source) : []
}

function withoutCcgHooks(doc: Json, codexHome: string): Json {
  const groups = doc.hooks?.UserPromptSubmit
  if (!Array.isArray(groups)) return doc
  const hooks = { ...doc.hooks }
  const kept = groups.flatMap((group: Json) => {
    if (!Array.isArray(group?.hooks) || Object.keys(group).some(k => k !== 'hooks')) return [group]
    const rest = group.hooks.filter((h: Json) => !isCcgHandler(h, codexHome, true))
    return rest.length === group.hooks.length ? [group] : rest.length ? [{ ...group, hooks: rest }] : []
  })
  if (kept.length) hooks.UserPromptSubmit = kept
  else delete hooks.UserPromptSubmit
  return { ...doc, hooks }
}

export function mergeCcgHooks(existing: Json | null, template: Json, codexHome: string): Json {
  // Updating in place keeps position-based trust keys of neighbouring user hooks stable.
  if (existing && ccgHookTrustEntries(existing, codexHome, true).length === 1) {
    const replacement = template.hooks.UserPromptSubmit[0].hooks[0]
    const groups = existing.hooks.UserPromptSubmit.map((group: Json) => {
      if (!Array.isArray(group?.hooks) || Object.keys(group).some(k => k !== 'hooks')) return group
      return { ...group, hooks: group.hooks.map((h: Json) => isCcgHandler(h, codexHome, true) ? replacement : h) }
    })
    return { ...existing, hooks: { ...existing.hooks, UserPromptSubmit: groups } }
  }
  const doc = withoutCcgHooks(existing ?? {}, codexHome)
  return { ...doc, hooks: { ...doc.hooks, UserPromptSubmit: [
    ...(doc.hooks?.UserPromptSubmit || []), ...template.hooks.UserPromptSubmit,
  ] } }
}

export async function readHooksJson(path: string): Promise<Json | null> {
  if (!(await fs.pathExists(path))) return null
  const doc = await fs.readJson(path)
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) ||
      ('hooks' in doc && (!doc.hooks || typeof doc.hooks !== 'object' || Array.isArray(doc.hooks))) ||
      (doc.hooks && 'UserPromptSubmit' in doc.hooks && !Array.isArray(doc.hooks.UserPromptSubmit)))
    throw new Error('Invalid Codex hooks.json; original file kept')
  return doc
}

async function writeAtomic(path: string, content: string) {
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await fs.rename(tmp, path)
  }
  finally { await fs.remove(tmp) }
}

export function writeHooksJson(path: string, doc: Json) {
  return writeAtomic(path, `${JSON.stringify(doc, null, 2)}\n`)
}

export function ccgHooksTrusted(entries: CcgHookTrust[], config: Json): boolean {
  const state = config.hooks?.state
  return entries.length > 0 && entries.every(({ key, hash }) =>
    state?.[key]?.enabled !== false && state?.[key]?.trusted_hash === hash)
}

export async function readCcgHookTrust(codexHome: string, hooks: Json): Promise<boolean> {
  try {
    const config = parse(await fs.readFile(join(codexHome, 'config.toml'), 'utf8'))
    return ccgHooksTrusted(await installedCcgHookTrustEntries(hooks, codexHome), config)
  }
  catch { return false }
}

// Only remove an exact, unmodified approval for a handler we just uninstalled.
// Noncanonical or inline TOML is left to Codex; never reserialize user config.
async function forgetTrust(codexHome: string, entries: CcgHookTrust[]): Promise<number> {
  const path = join(codexHome, 'config.toml')
  if (!entries.length || !(await fs.pathExists(path))) return 0
  const original = await fs.readFile(path, 'utf8')
  let text = original
  let removed = 0
  try {
    const expected = parse(original) as Json
    for (const { key, hash } of entries) {
      const previous = expected.hooks?.state?.[key]
      if (previous?.trusted_hash !== hash || Object.keys(previous).length !== 1) continue
      const escapedKey = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const block = new RegExp(`^\\[hooks\\.state\\.${escapedKey}\\]\\r?\\ntrusted_hash = "${hash}"(?:\\r?\\n|$)`, 'm')
      if (!block.test(text)) continue
      text = text.replace(block, '')
      delete expected.hooks.state[key]
      removed++
    }
    if (!removed) return 0
    const actual = parse(text) as Json
    // Removing the last explicit child may remove implicit parent tables.
    if (!actual.hooks?.state && !Object.keys(expected.hooks.state).length) delete expected.hooks.state
    if (!actual.hooks && !Object.keys(expected.hooks).length) delete expected.hooks
    if (!isDeepStrictEqual(expected, actual)) return 0
  }
  catch { return 0 }
  await writeAtomic(path, text)
  return removed
}

/**
 * Take CCG's hooks back out of ~/.codex: its trust records and its hooks.json
 * groups. The file is deleted only when nothing of the user's is left in it.
 */
export async function uninstallCcgCodexHooks(codexHome: string): Promise<string[]> {
  const hooksPath = join(codexHome, 'hooks.json')
  const hooksJson = await readHooksJson(hooksPath)
  if (!hooksJson) return []
  const removed: string[] = []
  const entries = await installedCcgHookTrustEntries(hooksJson, codexHome, true)
  if (!entries.length) return []
  const forgotten = await forgetTrust(codexHome, entries)
  if (forgotten) removed.push(`~/.codex/config.toml [hooks.state] (${forgotten} CCG trust record${forgotten > 1 ? 's' : ''})`)
  const rest = withoutCcgHooks(hooksJson, codexHome)
  if (!Object.keys(rest.hooks || {}).length && Object.keys(rest).length === 1) {
    await fs.remove(hooksPath)
    removed.push('~/.codex/hooks.json')
  }
  else if (JSON.stringify(rest) !== JSON.stringify(hooksJson)) {
    await writeHooksJson(hooksPath, rest)
    removed.push('~/.codex/hooks.json (CCG hook only; your hooks kept)')
  }
  return removed
}
