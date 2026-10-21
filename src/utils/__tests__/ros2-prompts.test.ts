import fs from 'fs-extra'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'

const PROMPTS = join(import.meta.dirname, '../../../templates/prompts')
const BACKENDS = ['antigravity', 'claude', 'codex', 'gemini', 'grok', 'kimi', 'opencode']

describe('routed ROS2 role contracts', () => {
  it('ships ROS2 context and validation guidance in every existing role file', () => {
    let count = 0
    for (const backend of BACKENDS) {
      for (const file of fs.readdirSync(join(PROMPTS, backend))) {
        const text = fs.readFileSync(join(PROMPTS, backend, file), 'utf8')
        for (const signal of ['package.xml', 'rclcpp', 'rclpy', '.msg', '.srv', '.action', 'QoS', 'LifecycleNode', 'callback group', 'tf2', 'colcon build', 'colcon test', 'launch_testing', '/dev/tty', 'can0']) {
          expect(text, `${backend}/${file} lacks ${signal}`).toContain(signal)
        }
        count++
      }
    }
    expect(count).toBe(52)
  })

  it('preserves distinct patch, report, score and builder permission contracts', () => {
    const read = (backend: string, role: string) => fs.readFileSync(join(PROMPTS, backend, `${role}.md`), 'utf8')
    for (const backend of ['codex', 'gemini', 'claude', 'grok', 'kimi', 'opencode']) {
      expect(read(backend, 'architect')).toContain('Unified Diff Patch ONLY')
    }
    expect(read('antigravity', 'architect')).toContain('Architecture plan / design document only')
    expect(read('antigravity', 'tester')).toContain('Test plan and test code snippets')
    for (const backend of ['codex', 'gemini', 'grok', 'kimi', 'opencode']) {
      expect(read(backend, 'reviewer')).toContain('TOTAL SCORE: XX/100')
      expect(read(backend, 'reviewer')).toContain('RECOMMENDATION: [PASS/NEEDS_IMPROVEMENT]')
    }
    expect(read('antigravity', 'reviewer')).toContain('VERDICT: [APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION]')
    for (const backend of ['antigravity', 'codex', 'grok', 'kimi', 'opencode']) {
      expect(read(backend, 'builder')).toContain('FULL file system write permission')
    }
  })
})
