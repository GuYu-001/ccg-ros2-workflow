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

  it('does not let a domain that did not ship use up a slot', async () => {
    const { context } = await runHook({}, 'a pentest of the graphql api behind redis', domainKnowledge)
    expect(context).toContain('API设计')
    expect(context).toContain('缓存架构')
  })
})

async function domainKnowledge(dir: string) {
  for (const [sub, file] of [['ai', 'rag-system.md'], ['ai', 'agent-dev.md'], ['architecture', 'message-queue.md'], ['architecture', 'caching.md'], ['architecture', 'api-design.md'], ['architecture', 'cloud-native.md']]) {
    const root = join(dir, 'skills', 'ccg', 'domains', sub)
    await mkdir(root, { recursive: true })
    await writeFile(join(root, file), `# ${file}`)
  }
}

describe('domain keyword matching', () => {
  it.each([
    '存储速度向量到 std::vector<geometry_msgs::msg::Vector3>',
    '排查 ROS2 DDS endpoint discovery',
    '修改 tf2 buffer 的 cache time 和变换缓存时长',
    'launch orchestration: source setup.bash and run the binary',
    '排查 QoS 消息队列深度与 ROS2 pub/sub sink',
    'sensor fault injection during an incident',
  ])('does not route robot middleware vocabulary: %s', async (prompt) => {
    expect((await runHook({}, prompt, domainKnowledge)).output).toBe('')
  })

  it.each([
    ['用 Redis 做缓存', '缓存架构'], ['设计 REST API', 'API设计'],
    ['给 RAG 建向量数据库', 'RAG系统'], ['choose a vector database', 'RAG系统'],
    ['设计分布式消息队列', '消息队列'], ['design agent orchestration', 'Agent开发'],
  ])('still routes domain-specific requests: %s', async (prompt, skill) => {
    expect((await runHook({}, prompt, domainKnowledge)).context).toContain(skill)
  })

  it('ignores English keywords that only appear inside longer words', async () => {
    for (const prompt of ['fix average() in calc.py', 'restore the backup and check interest', 'the cached value is stale']) {
      const { output } = await runHook({}, prompt, domainKnowledge)
      expect(output, prompt).toBe('')
    }
  })

  it('does not read the everyday word "rest" as REST', async () => {
    const { output } = await runHook({}, 'read the rest of the file', domainKnowledge)
    expect(output).toBe('')
  })

  it('matches English keywords as whole words, case-insensitively', async () => {
    expect((await runHook({}, 'Build a RAG pipeline', domainKnowledge)).context).toContain('RAG系统')
    expect((await runHook({}, 'add a cache layer (redis)', domainKnowledge)).context).toContain('缓存架构')
    expect((await runHook({}, 'design the REST API', domainKnowledge)).context).toContain('API设计')
  })

  it('keeps matching plurals and the words a whole-word rule would lose', async () => {
    expect((await runHook({}, 'list all API endpoints', domainKnowledge)).context).toContain('API设计')
    expect((await runHook({}, 'store the embeddings', domainKnowledge)).context).toContain('RAG系统')
    expect((await runHook({}, 'open the dockerfile', domainKnowledge)).context).toContain('云原生')
  })

  it('keeps substring matching for keywords containing CJK characters', async () => {
    expect((await runHook({}, '帮我加一层缓存', domainKnowledge)).context).toContain('缓存架构')
    expect((await runHook({}, '这个api设计要怎么做', domainKnowledge)).context).toContain('API设计')
  })
})

describe('model-action intent', () => {
  it('treats a matched phrase as a mention, not as a confirmed request', async () => {
    const prompt = '那个对话开启 Codex review 时，还是用默认浏览器打开'
    for (const config of [{}, { routing: { frontend: { primary: 'claude' }, backend: { primary: 'claude' } } }]) {
      const { context } = await runHook(config, prompt)
      expect(context).toContain('不代表用户一定在请求执行')
      expect(context).not.toContain('用户请求')
    }
  })
})
