import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

export const AGY_CLI = { label: 'Antigravity CLI', commands: ['agy'], windows: ['agy.exe', 'agy.cmd'] }

export function executeVersion(file: string, args: string[]): string | null {
  try {
    // Only fixed npm shim names use cmd.exe. Paths and configuration values
    // never become shell commands; native executables run directly.
    const flag = args[0]
    if (args.length !== 1 || (flag !== '--version' && flag !== '--help')) return null
    const shim = process.platform === 'win32' && /^[\w-]+\.cmd$/.test(file)
    const result = spawnSync(shim ? 'cmd.exe' : file, shim ? ['/d', '/s', '/c', `${file} ${flag}`] : args, { encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', windowsHide: true })
    if (result.error || result.status !== 0) return null
    return (flag === '--help' ? [result.stdout, result.stderr].join('\n') : result.stdout).trim()
  }
  catch { return null }
}

function findAgyOnPath(): string | undefined {
  const win = process.platform === 'win32'
  const directories = (process.env.PATH || '').split(delimiter)
  return (win ? AGY_CLI.windows : AGY_CLI.commands).find(name => directories.some(dir => {
    try { return statSync(join(win ? dir.replace(/^"|"$/g, '') : dir, name)).isFile() }
    catch { return false }
  }))
}

// Doctor already knows which CLI passed --version. Init only needs a single help probe.
export function probeAgyOutputFormat(command = findAgyOnPath(), exec = executeVersion): 'missing' | 'supported' | 'unconfirmed' {
  if (!command) return 'missing'
  const help = exec(command, ['--help'])
  const available = stripVTControlCharacters(help || '').split('\n').some(line => {
    const usage = /^(?:usage:\s*)?agy\s/i.test(line.trim())
    // Option rows can start with aliases and their metavars. Do not match prose.
    if (!usage && !/^\s*\[?-/.test(line)) return false
    const options = usage ? line : line.trim().split(/\s{2,}/, 1)[0]
    return /(?:^|[\s,|\[])--output-format(?=[\s,:=<\[\]]|$)/.test(options)
  })
  return available ? 'supported' : 'unconfirmed'
}
