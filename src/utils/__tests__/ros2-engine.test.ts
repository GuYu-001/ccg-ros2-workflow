import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import fs from 'fs-extra'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')
const read = (file: string) => fs.readFileSync(join(ROOT, 'templates', file), 'utf8')
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(p => fs.remove(p))) })

describe('ROS2 go engine templates', () => {
  it('maps six ROS2 domains to available native and legacy skills after reading workspace context', () => {
    const go = read('commands/go.md')
    for (const name of ['perception', 'control', 'navigation', 'manipulation', 'hardware', 'upper-app']) {
      expect(go).toContain(`ros2-${name}`)
      expect(fs.existsSync(join(ROOT, 'templates/skills/domains', `ros2-${name}`, 'SKILL.md'))).toBe(true)
    }
    for (const signal of ['package.xml', 'colcon list', '*.launch.py', 'native', 'legacy']) expect(go).toContain(signal)
  })

  it('keeps existing development phase ids and appends deployment before terminal archiving', () => {
    for (const [strategy, phase] of [['full-collaborate', '6-final'], ['guided-develop', '6-verify']]) {
      const text = read(`engine/strategies/${strategy}.md`)
      expect(text).toContain(`[phase-state:${phase}]`)
      expect(text).toContain('[phase-state:7-deploy]')
      expect(text).toContain('currentPhase → "7-deploy"')
      expect(text.indexOf('### Phase 7:')).toBeGreaterThan(text.indexOf('### Phase 6:'))
      expect(text.indexOf('status → "archived"')).toBeGreaterThan(text.indexOf('### Phase 7:'))
      expect(text).toContain('phase-guide.md § 11')
      expect(text).toContain('phase-guide.md § 12')
    }
  })

  it('requires shared ROS2 verification and deployment checks in every code-changing strategy', () => {
    for (const strategy of ['direct-fix', 'quick-implement', 'debug-investigate', 'refactor-safely', 'optimize-measure']) {
      const text = read(`engine/strategies/${strategy}.md`)
      expect(text, strategy).toContain('phase-guide.md § 11')
      expect(text, strategy).toContain('phase-guide.md § 12')
    }
    const guide = read('engine/phase-guide.md')
    for (const command of ['colcon build --packages-up-to', 'colcon test --packages-select', 'colcon test-result --verbose', 'launch_testing']) expect(guide).toContain(command)
    for (const signal of ['/dev/tty', 'can0', 'deploy.sh', 'Gazebo', 'skipped', 'blocked', 'not run']) expect(guide).toContain(signal)
    expect(read('commands-legacy/workflow.md')).toContain('phase-guide.md § 12')
  })

  it('persists a skipped deployment outcome as archived without an active Hook breadcrumb', async () => {
    const guide = read('engine/phase-guide.md')
    const match = guide.match(/<!-- ROS2_DEPLOY_SKIPPED -->\s*```json\s*([\s\S]*?)```/)
    expect(match, 'shared skipped deployment archive example').not.toBeNull()
    const skipped = JSON.parse(match![1])
    expect(skipped).toMatchObject({ status: 'archived', currentPhase: '7-deploy', deployment: { status: 'skipped' } })
    const root = await fs.mkdtemp(join(tmpdir(), 'ccg-skipped-deploy-'))
    directories.push(root)
    const hooks = join(root, 'hooks')
    await fs.copy(join(ROOT, 'templates/hooks'), hooks)
    await fs.writeJson(join(hooks, 'package.json'), { type: 'commonjs' })
    await fs.outputJson(join(root, '.ccg/tasks/skipped/task.json'), { id: 'skipped', ...skipped })
    const require = createRequire(import.meta.url)
    const utils = require(join(hooks, 'task-utils.js'))
    expect(utils.isTerminalStatus(skipped.status)).toBe(true)
    expect(utils.getActiveTask(root)).toBeNull()
    expect(execFileSync(process.execPath, [join(hooks, 'workflow-state.js')], {
      cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    })).toBe('')
    const archived = utils.archiveTask(join(root, '.ccg/tasks/skipped'), root)
    expect(archived).toBeTruthy()
    expect(await fs.readJson(join(archived, 'task.json'))).toMatchObject(skipped)
    expect(await fs.pathExists(join(root, '.ccg/tasks/skipped'))).toBe(false)
    expect(execFileSync('python3', [join(ROOT, 'templates/codex/hooks/ccg-workflow.py')], {
      cwd: root, encoding: 'utf8', env: { ...process.env, CODEX_PROJECT_DIR: root, CODEX_AGENT_TYPE: '', CODEX_FORK_TURNS: '' },
    })).not.toContain('Task: skipped')
  })
})
