import { execFileSync, execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCodexMode, uninstallCodexMode } from '../installer'

const testHome = vi.hoisted(() => ({ path: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => testHome.path }
})

describe('Codex mode hook lifecycle', () => {
  beforeEach(async () => {
    testHome.path = await fs.mkdtemp(join(tmpdir(), 'ccg-test-codex-'))
  })

  afterEach(async () => {
    await fs.remove(testHome.path)
  })

  it('runs the installed UserPromptSubmit command', async () => {
    const result = await installCodexMode()
    expect(result.success).toBe(true)

    const config = await fs.readJson(join(testHome.path, '.codex', 'hooks.json'))
    const command = config.hooks.UserPromptSubmit[0].hooks[0].command
    expect(execSync(command, { cwd: testHome.path, encoding: 'utf-8' })).toBe('')
  })

  it('reports the hook file that was actually installed', async () => {
    const result = await installCodexMode()
    expect(result.success).toBe(true)

    const hookPath = result.message.split('\n').find(line => line.trim().endsWith('.py'))!.trim()
    expect(await fs.pathExists(hookPath.replace('~', testHome.path))).toBe(true)
  })

  it('removes its installed hook while preserving user hooks and config', async () => {
    const result = await installCodexMode()
    expect(result.success).toBe(true)
    const codexHome = join(testHome.path, '.codex')
    const userHook = join(codexHome, 'hooks', 'user-hook.py')
    await fs.writeFile(userHook, '# user hook\n')

    const uninstallResult = await uninstallCodexMode()
    expect(uninstallResult.success).toBe(true)
    expect(await fs.pathExists(join(codexHome, 'hooks', 'ccg-workflow.py'))).toBe(false)
    expect(await fs.readFile(userHook, 'utf-8')).toBe('# user hook\n')
    expect(await fs.pathExists(join(codexHome, 'config.toml'))).toBe(true)
  })

  it.each(['backend', 'frontend'])('discovers the %s spec through the installed hook', async (domain) => {
    const result = await installCodexMode()
    expect(result.success).toBe(true)
    const projectDir = join(testHome.path, 'project')
    await fs.copy(
      join(import.meta.dirname, '..', '..', '..', 'templates', 'spec'),
      join(projectDir, '.ccg', 'spec'),
    )
    await fs.outputJson(join(projectDir, '.ccg', 'tasks', 'test-task', 'task.json'), {
      title: 'Spec discovery',
      status: 'in_progress',
      complexity: 'S',
      currentPhase: 'implementation',
    })

    const output = execFileSync('python3', [join(testHome.path, '.codex', 'hooks', 'ccg-workflow.py')], {
      cwd: projectDir,
      encoding: 'utf-8',
      env: { ...process.env, CODEX_PROJECT_DIR: projectDir, CODEX_AGENT_TYPE: '', CODEX_FORK_TURNS: '' },
    })
    const context = JSON.parse(output).hookSpecificOutput.additionalContext
    expect(context).toContain(`.ccg/spec/${domain}/index.md`)
  })
})
