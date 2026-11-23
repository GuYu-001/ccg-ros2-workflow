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
  await writeDomainFixtures(dir, {
    ai: ['rag-system', 'agent-dev', 'llm-security'],
    architecture: ['message-queue', 'caching', 'api-design', 'cloud-native'],
  })
}

async function allDomainKnowledge(dir: string) {
  await domainKnowledge(dir)
  // Simulate an optional domain installed locally; negative prompts must still stay silent.
  await writeDomainFixtures(dir, {
    security: ['red-team', 'blue-team', 'pentest', 'code-audit', 'vuln-research', 'threat-intel'],
  })
}

async function writeDomainFixtures(dir: string, domains: Record<string, string[]>) {
  for (const [domain, names] of Object.entries(domains)) {
    const root = join(dir, 'skills', 'ccg', 'domains', domain)
    await mkdir(root, { recursive: true })
    for (const name of names) await writeFile(join(root, `${name}.md`), `# ${name}`)
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
    'source install/setup.bash before starting rviz',
    'monitor the camera sink buffer',
    'where is the installed ROS2 binary',
    'sensor fault injection in Gazebo',
    'record the timing of the robot incident',
    '检查电池电压告警来源',
    '给机器人维护文档补充应急停车说明',
    'message versioning for our sensor interfaces',
    'handle tf2 frame invalidation after a clock jump',
    'use an event driven executor for callbacks',
    'rclcpp message queue depth on the subscription',
    'point cloud retrieval pipeline for scan matching',
    'rosbag2 storage chunking at playback',
    '检查横向控制误差',
    '逆向运动学求解失败 KDL',
    'detect unintended bypass of the robot safety controller',
    'detect a collision threat from the lidar scan',
    'camera c2 extrinsic calibration',
    'robot with ropes and pulleys',
    'tf 缓存不够',
    'rosbag2 缓存大小',
    '用 message_filters::Cache 做时间同步缓存',
    '给 tf2 buffer 加个缓存',
    '给相机回放加缓存',
    'publisher 和 subscriber 的消息队列满了',
    '用消息队列深度估算 DDS 堆积',
    'tf2 cache time for lookupTransform',
    'add a cache for tf2 transforms',
    'DDS endpoint discovery after node restart',
    'std::vector<sensor_msgs::msg::Image> for camera frames',
    '计算速度向量在 base_link 下的投影',
    'ROS2 launch orchestration for lifecycle nodes',
    'trace ROS2 pub/sub latency with simulated time',
    'read the rest of the joint state samples',
    '查询 tf 树上的坐标系',
    'read the docs for lifecycle publishers',
  ])('does not route robot middleware vocabulary: %s', async (prompt) => {
    expect((await runHook({}, prompt, allDomainKnowledge)).output).toBe('')
  })

  it.each([
    ['用 Redis 做缓存', '缓存架构'], ['设计 REST API', 'API设计'],
    ['给 RAG 建向量数据库', 'RAG系统'], ['choose a vector database', 'RAG系统'],
    ['设计分布式消息队列', '消息队列'], ['design agent orchestration', 'Agent开发'],
    ['用消息队列解耦两个服务', '消息队列'],
    ['消息队列选型', '消息队列'],
    ['use a message queue to decouple two services', '消息队列'],
    ['event driven architecture with pub/sub', '消息队列'],
    ['讨论事件驱动架构', '消息队列'],
    ['加缓存提高查询性能', '缓存架构'],
    ['给查询接口加个缓存', '缓存架构'],
    ['add a cache to speed up queries', '缓存架构'],
    ['缓存穿透怎么解决', '缓存架构'],
    ['缓存雪崩和缓存击穿', '缓存架构'],
    ['怎么防止缓存雪崩', '缓存架构'],
    ['怎么防止缓存击穿', '缓存架构'],
    ['缓存失效策略', '缓存架构'],
    ['缓存策略怎么设计', '缓存架构'],
    ['设计缓存方案', '缓存架构'],
    ['cache eviction policy LRU vs LFU', '缓存架构'],
    ['retrieval augmented generation', 'RAG系统'],
    ['build a retrieval pipeline for docs', 'RAG系统'],
    ['文档切分和 chunking 策略', 'RAG系统'],
    ['chunking strategy for PDFs', 'RAG系统'],
    ['build a vector store', 'RAG系统'],
    ['vector db selection', 'RAG系统'],
    ['检索增强生成是怎么工作的', 'RAG系统'],
    ['GraphRAG 怎么搭', 'RAG系统'],
    ['vector-database choice', 'RAG系统'],
    ['design a REST endpoint for robot status', 'API设计'],
    ['生成 OpenAPI 文档', 'API设计'],
    ['REST-API 怎么设计', 'API设计'],
    ['explain REST_API naming', 'API设计'],
    ['design a REST   API', 'API设计'],
    ['ai-agent framework', 'Agent开发'],
    ['prompt-injection defense', 'LLM安全'],
    ['detect jailbreaking attempts against the model', 'LLM安全'],
  ])('still routes domain-specific requests: %s', async (prompt, skill) => {
    const { context } = await runHook({}, prompt, allDomainKnowledge)
    expect(context.match(/^## .+ \(auto-injected\)$/gm)).toEqual([`## ${skill} (auto-injected)`])
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
    expect((await runHook({}, '给 ROS2微服务v2 写一份接口约定', domainKnowledge)).context).toContain('云原生')
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
