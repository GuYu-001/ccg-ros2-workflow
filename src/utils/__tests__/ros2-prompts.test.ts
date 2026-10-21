import fs from 'fs-extra'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'
import type { ModelType } from '../../types'
import { injectConfigVariables } from '../installer-template'

const PROMPTS = join(import.meta.dirname, '../../../templates/prompts')
const BACKENDS = ['antigravity', 'claude', 'codex', 'gemini', 'grok', 'kimi', 'opencode'] satisfies ModelType[]

describe('routed ROS2 role contracts', () => {
  it('resolves a scoped writable builder for every selectable backend', () => {
    expect(BACKENDS.filter(backend => !fs.existsSync(join(PROMPTS, backend, 'builder.md')))).toEqual([])
    for (const backend of BACKENDS) {
      const role = injectConfigVariables('{{BACKEND_PRIMARY}}/builder.md', {
        routing: { frontend: { primary: 'antigravity' }, backend: { primary: backend } },
      })
      expect(fs.existsSync(join(PROMPTS, role)), `missing routed role ${role}`).toBe(true)
      const text = fs.readFileSync(join(PROMPTS, role), 'utf8')
      expect(text).toContain('FULL file system write permission')
      expect(text).toContain('Execution Report')
      expect(text).toContain('only the test files explicitly listed in the approved plan')
    }
  })

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
    expect(count).toBe(54)
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
    for (const backend of ['codex', 'grok', 'kimi', 'opencode']) {
      const text = read(backend, 'builder')
      expect(text).toContain('## What NOT to Do')
      expect(text).toContain('Do NOT add comments explaining your changes')
      expect(text).toContain('Do NOT modify test files unless the plan explicitly includes them')
      expect(text).toContain('Do NOT ask questions')
      expect(text).toContain('the simplest choice that satisfies the spec')
    }
    expect(read('antigravity', 'builder')).toContain('Match existing patterns (naming, error handling, imports)')
  })
})
