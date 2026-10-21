import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { injectHookConfig, PACKAGE_ROOT } from '../installer-template'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))) })

async function runHook(config: Parameters<typeof injectHookConfig>[1], prompt: string, setup?: (dir: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ccg-hook-routing-'))
  directories.push(root)
  const installDir = join(root, "CCG O'Neil `cache` $home")
  const hookDir = join(installDir, 'hooks', 'ccg')
  await mkdir(hookDir, { recursive: true })
  const template = await readFile(join(PACKAGE_ROOT, 'templates', 'hooks', 'skill-router.js'), 'utf8')
  const script = injectHookConfig(template, config, installDir)
  expect(script).not.toMatch(/\{\{[A-Z_]+\}\}/)
  await writeFile(join(hookDir, 'skill-router.js'), script)
  await copyFile(join(PACKAGE_ROOT, 'templates', 'hooks', 'task-utils.js'), join(hookDir, 'task-utils.js'))
  await setup?.(installDir)
  const output = execFileSync(process.execPath, [join(hookDir, 'skill-router.js')], {
    input: JSON.stringify({ prompt }), encoding: 'utf8', cwd: root,
  })
  return { root, installDir, script, output, context: output ? JSON.parse(output).hookSpecificOutput.additionalContext as string : '' }
}

describe('installed model-action Hook', () => {
  it('uses configured backends, concrete model flags and shell-safe paths', async () => {
    const { context } = await runHook({ routing: {
      frontend: { primary: 'grok' }, backend: { primary: 'opencode' },
      grokModel: 'grok-example', opencodeModel: 'deepseek/model-example',
    }, liteMode: true }, '双模型审查')
    expect(context).toContain('--backend grok --grok-model \'grok-example\'')
    expect(context).toContain('--backend opencode --opencode-model \'deepseek/model-example\'')
    expect(context).toContain("O'\\''Neil")
    expect(context).toContain('--progress --lite')
    expect(context).not.toContain('--backend codex')
    expect(context).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('does not spend two calls on one configured backend', async () => {
    const { context } = await runHook({ routing: {
      frontend: { primary: 'codex' }, backend: { primary: 'codex' },
    } }, '双模型分析')
    expect(context.match(/--backend codex/g)).toHaveLength(1)
    expect(context).toContain('1 个独立后端')
  })

  it('uses native Agents for a pure-Claude configuration', async () => {
    const { context } = await runHook({ routing: {
      frontend: { primary: 'claude' }, backend: { primary: 'claude' },
    } }, '双模型审查')
    expect(context).toContain('Claude Code 原生 Agent')
    expect(context).not.toContain('codeagent-wrapper')
  })

  it('keeps explicit user backend requests distinct from the configured default', async () => {
    const { context } = await runHook({ routing: {
      frontend: { primary: 'grok' }, backend: { primary: 'opencode' },
    } }, '用codex看这个改动')
    expect(context).toContain('--backend codex')
    expect(context).not.toContain('--backend opencode')
  })
})

async function longKnowledge(dir: string) {
  const root = join(dir, 'skills', 'ccg', 'domains', 'architecture')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'api-design.md'), 'x'.repeat(50_000))
}

describe('knowledge context', () => {
  it('bounds legacy excerpts even when a single line is very long', async () => {
    const { context } = await runHook({}, 'api设计要怎么做', longKnowledge)
    expect(context).toContain('<ccg-domain-knowledge>')
    expect(context.length).toBeLessThan(8100)
  })

  it('uses native progressive disclosure without duplicating legacy knowledge', async () => {
    const { output } = await runHook({ skillsProfile: ['verify-quality'] }, 'api设计要怎么做', longKnowledge)
    expect(output).toBe('')
  })
})
