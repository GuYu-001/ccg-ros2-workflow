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
 * all, so a fresh `codex-mode install` used to leave Codex mode silently inert.
 * Installation therefore records trust for the one handler it installs itself,
 * the same way the `/hooks` screen would. Other handlers are never touched, and
 * the rest of config.toml is kept byte for byte: the record is edited in the
 * text, re-parsed, and written only if nothing else changed. When that cannot
 * be shown, nothing is written and the user is pointed at `/hooks` instead.
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

// Write through a symlinked config.toml (dotfile managers) instead of replacing the link.
async function configTomlPath(codexHome: string): Promise<string> {
  const path = join(codexHome, 'config.toml')
  return await fs.realpath(path).catch(() => path)
}

const trustHeader = (key: string) => `[hooks.state.${JSON.stringify(key)}]`

// Point an existing record at the new hash, keeping its other keys and position.
// Returns null when the record is not written as its own plain table.
function replaceTrustedHash(text: string, key: string, hash: string): string | null {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.trim() === trustHeader(key))
  if (start < 0) return null
  const eol = lines[start].endsWith('\r') ? '\r' : ''
  const line = `trusted_hash = "${hash}"${eol}`
  for (let i = start + 1; i < lines.length && !/^\s*\[/.test(lines[i]); i++) {
    if (/^\s*trusted_hash\s*=/.test(lines[i])) {
      lines[i] = line
      return lines.join('\n')
    }
  }
  lines.splice(start + 1, 0, line)
  return lines.join('\n')
}

function dropEmptyHookState(config: Json) {
  if (config.hooks?.state && !Object.keys(config.hooks.state).length) delete config.hooks.state
  if (config.hooks && !Object.keys(config.hooks).length) delete config.hooks
}

/**
 * Record Codex trust for the CCG handler in `hooks`, which must already be on
 * disk. Returns whether that handler ends up trusted. A hook the user disabled
 * in Codex stays disabled, and a config.toml that cannot be edited without
 * touching anything else (inline tables, invalid TOML) is left alone.
 */
export async function trustCcgCodexHooks(codexHome: string, hooks: Json, stale: CcgHookTrust[] = []): Promise<boolean> {
  const entries = await installedCcgHookTrustEntries(hooks, codexHome)
  if (!entries.length) return false
  // A reinstall that moved the handler leaves approvals under its old positions.
  const current = new Set(entries.map(e => e.key))
  await forgetTrust(codexHome, stale.filter(e => !current.has(e.key)))

  const path = await configTomlPath(codexHome)
  const original = await fs.pathExists(path) ? await fs.readFile(path, 'utf8') : ''
  try {
    const before = parse(original) as Json
    if (ccgHooksTrusted(entries, before)) return true
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    let text = original
    for (const { key, hash } of entries) {
      const previous = before.hooks?.state?.[key]
      if (previous?.enabled === false) return false
      if (previous?.trusted_hash === hash) continue
      if (previous) {
        const replaced = replaceTrustedHash(text, key, hash)
        if (replaced === null) return false
        text = replaced
      }
      else {
        text += `${text && !text.endsWith('\n') ? eol : ''}${trustHeader(key)}${eol}trusted_hash = "${hash}"${eol}`
      }
    }
    // Prove the edit added these approvals and changed nothing else.
    const after = parse(text) as Json
    for (const { key, hash } of entries) {
      const previous = before.hooks?.state?.[key]
      if (!isDeepStrictEqual({ ...after.hooks?.state?.[key] }, { ...previous, trusted_hash: hash })) return false
      delete after.hooks.state[key]
      if (previous) delete before.hooks.state[key]
    }
    dropEmptyHookState(before)
    dropEmptyHookState(after)
    if (!isDeepStrictEqual(before, after)) return false
    await writeAtomic(path, text)
    return true
  }
  catch { return false }
}

// Only remove an exact, unmodified approval for a handler we just uninstalled.
// Noncanonical or inline TOML is left to Codex; never reserialize user config.
async function forgetTrust(codexHome: string, entries: CcgHookTrust[]): Promise<number> {
  const path = await configTomlPath(codexHome)
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
