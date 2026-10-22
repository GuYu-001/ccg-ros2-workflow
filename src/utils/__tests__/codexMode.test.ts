import { execFileSync, execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fs from 'fs-extra'
import { parse as parseToml } from 'smol-toml'
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

  it('does not add unsolicited model providers to a fresh installation', async () => {
    expect((await installCodexMode()).success).toBe(true)
    const config = parseToml(await fs.readFile(join(testHome.path, '.codex', 'config.toml'), 'utf8'))
    expect(config.model_providers).toBeUndefined()
    expect(config.model_provider).toBeUndefined()
  })

  it('preserves custom model providers and activation byte-for-byte through install and uninstall', async () => {
    const configPath = join(testHome.path, '.codex', 'config.toml')
    const config = `# User-owned provider configuration
model_provider = "custom"
model = "custom-model"

[model_providers.custom]
name = "Custom gateway"
base_url = "https://gateway.example.test/v1"
env_key = "CUSTOM_API_KEY"
wire_api = "responses"
`
    await fs.outputFile(configPath, config)
    expect((await installCodexMode()).success).toBe(true)
    expect(await fs.readFile(configPath, 'utf8')).toBe(config)
    expect((await uninstallCodexMode()).success).toBe(true)
    expect(await fs.readFile(configPath, 'utf8')).toBe(config)
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

  async function runRiskHook(options: { file?: string, title?: string, content?: string, staged?: boolean, risk?: string, renameFrom?: string, phase?: string }) {
    expect((await installCodexMode()).success).toBe(true)
    const project = join(testHome.path, 'robot')
    await fs.outputJson(join(project, '.ccg/tasks/test/task.json'), {
      title: options.title || 'Update robot package',
      status: 'in_progress', complexity: 'S', currentPhase: options.phase || 'implementation', risk: options.risk || 'low',
    })
    execFileSync('git', ['init', '-q'], { cwd: project })
    if (options.content || options.renameFrom) {
      await fs.outputFile(join(project, options.renameFrom || options.file || 'src/node.cpp'), 'const int value = 1;\n')
      execFileSync('git', ['add', '.'], { cwd: project })
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline'], { cwd: project })
      if (options.renameFrom) execFileSync('git', ['mv', options.renameFrom, options.file!], { cwd: project })
      else await fs.writeFile(join(project, options.file || 'src/node.cpp'), options.content!)
      if (options.staged) execFileSync('git', ['add', '.'], { cwd: project })
    }
    else if (options.file) {
      await fs.outputFile(join(project, options.file), 'placeholder\n')
    }
    const output = execFileSync('python3', [join(testHome.path, '.codex/hooks/ccg-workflow.py')], {
      cwd: project, encoding: 'utf8',
      env: { ...process.env, CODEX_PROJECT_DIR: project, CODEX_AGENT_TYPE: '', CODEX_FORK_TURNS: '' },
    })
    return JSON.parse(output).hookSpecificOutput.additionalContext as string
  }

  it.each(['src/motor_driver.cpp', 'src/actuator.cpp', 'src/emergency_stop.cpp', 'src/realtime_loop.cpp', 'src/can_write.cpp', 'src/serial_write.cpp', 'config/velocity_limits.yaml', 'src/急停.cpp'])(
    'requires safety review for the installed hook risk path %s',
    async (file) => {
      const context = await runRiskHook({ file })
      expect(context).toContain('High-risk')
      expect(context).toContain('review is REQUIRED')
    },
  )

  it.each([false, true])('detects ROS2 safety content in a neutral filename (staged=%s)', async (staged) => {
    const context = await runRiskHook({ content: 'max_velocity = 100.0; // change safe limit\n', staged })
    expect(context).toContain('High-risk')
    expect(context).toContain('review is REQUIRED')
  })

  it('uses the task intent before risky hardware files have been created', async () => {
    const context = await runRiskHook({ title: '修改电机参数安全上限并写入串口' })
    expect(context).toContain('High-risk')
  })

  it('honors an explicit high risk task even for a neutral title', async () => {
    const context = await runRiskHook({ risk: 'high' })
    expect(context).toContain('High-risk')
  })

  it('recognizes the risky source of a rename with spaces in both paths', async () => {
    const context = await runRiskHook({ file: 'src/plain node.cpp', renameFrom: 'src/motor driver.cpp' })
    expect(context).toContain('High-risk')
    expect(context).not.toContain('no files changed')
  })

  it('recognizes camelCase safety limits but not scan or cancel identifiers', async () => {
    expect(await runRiskHook({ content: 'const double maxVelocity = 100.0;\n' })).toContain('High-risk')
    await fs.remove(join(testHome.path, 'robot'))
    expect(await runRiskHook({ content: 'const int scanCount = 1; // cancel pending scan\n' })).not.toContain('High-risk')
  })

  it('keeps deployment on its checklist instead of restarting dual review for an already reviewed diff', async () => {
    const context = await runRiskHook({
      phase: '7-deploy',
      risk: 'high',
      content: Array.from({ length: 40 }, (_, n) => `const int value${n} = ${n};`).join('\n'),
    })
    expect(context).toContain('phase-guide.md')
    expect(context).toContain('deployment')
    expect(context).toContain('explicit user approval')
    expect(context).not.toContain('When done coding')
    expect(context).not.toContain('call BOTH')
    expect(context).not.toContain('Start coding')
  })

  it('warns about high-risk deployment files without restarting dual review', async () => {
    const context = await runRiskHook({
      phase: '7-deploy',
      file: 'src/motor_driver.cpp',
      content: Array.from({ length: 40 }, (_, n) => `const int value${n} = ${n};`).join('\n'),
    })
    expect(context).toContain('High-risk deployment')
    expect(context).toContain('independent safety review evidence')
    expect(context).toContain('missing evidence is blocked')
    expect(context).toContain('separate explicit user approval')
    expect(context).not.toContain('MUST call BOTH')
    expect(context).not.toContain('review is REQUIRED')
  })

  it('retains auth risk detection without treating ordinary can prose as CAN writes', async () => {
    expect(await runRiskHook({ file: 'src/auth.cpp' })).toContain('High-risk')
    await fs.remove(join(testHome.path, 'robot'))
    expect(await runRiskHook({ file: 'docs/overview.md', title: 'We can improve package documentation' })).not.toContain('High-risk')
  })
})
