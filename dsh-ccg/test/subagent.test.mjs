import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSubagentResult, directChildActivity, startTeammate } from '../src/subagent.js'

const parent = { id: 'parent-1' }
const request = () => ({
  label: 'review', signal: new AbortController().signal, parent,
  prompt: [{ type: 'text', text: 'Review this' }],
  agentOptions: { provider: 'gw', model: 'm', maxTokens: 800 },
  toolFilter: { deny: ['ccg_team'] },
})
const completed = { stopReason: 'completed', output: [{ type: 'text', text: 'answer' }] }

test('rc caller delivery uses start and disposes after collection', async () => {
  const spec = request()
  let disposed = 0
  const subagents = { async start(provider, received) {
    assert.equal(provider, 'spawn')
    assert.equal(received, spec)
    return { result: Promise.resolve(completed), async dispose() { disposed++ } }
  } }
  assert.equal(await collectSubagentResult(subagents, 'spawn', spec), completed)
  assert.equal(disposed, 1)
})

test('alpha caller delivery nests request, keeps route and filter, and disposes', async () => {
  const spec = request()
  let disposed = 0
  const subagents = { async startActivation(received) {
    const { label, signal, ...body } = spec
    assert.deepEqual(received, { provider: 'spawn', label, signal, request: body, delivery: 'caller' })
    assert.ok(!('signal' in received.request))
    assert.ok(!('label' in received.request))
    return { childId: 'child', result: Promise.resolve(completed), async dispose() { disposed++ } }
  } }
  assert.equal(await collectSubagentResult(subagents, 'spawn', spec), completed)
  assert.equal(disposed, 1)
})

test('result rejection still disposes; teardown failure keeps original error', async () => {
  const failure = new Error('provider failed')
  let disposed = 0
  const subagents = { async startActivation() {
    return { result: Promise.reject(failure), async dispose() { disposed++; throw new Error('teardown failed') } }
  } }
  await assert.rejects(collectSubagentResult(subagents, 'spawn', request()), error => error === failure)
  assert.equal(disposed, 1)
})

test('teardown failure is reported when result collection succeeded', async () => {
  const subagents = { async startActivation() {
    return { result: Promise.resolve(completed), async dispose() { throw new Error('teardown failed') } }
  } }
  await assert.rejects(collectSubagentResult(subagents, 'spawn', request()), /teardown failed/)
})

test('cancellation after alpha publication disposes exactly once and rejects', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled by caller')
  let published
  const ready = new Promise(resolve => { published = resolve })
  let resolveResult
  let disposed = 0
  const subagents = { async startActivation() {
    published()
    return {
      result: new Promise(resolve => { resolveResult = resolve }),
      async dispose() { disposed++; resolveResult({ stopReason: 'aborted', output: [] }) },
    }
  } }
  const collecting = collectSubagentResult(subagents, 'spawn', { ...request(), signal: controller.signal })
  await ready
  controller.abort(cancelled)
  await assert.rejects(collecting, error => error === cancelled)
  assert.equal(disposed, 1)
})

test('an already cancelled request starts no child', async () => {
  const controller = new AbortController()
  controller.abort(new Error('stop before start'))
  await assert.rejects(collectSubagentResult({ startActivation() { assert.fail('started') } }, 'spawn', {
    ...request(), signal: controller.signal,
  }), /stop before start/)
})

test('a resident alpha teammate selects parent delivery and is not disposed', async () => {
  const spec = { provider: 'spawn', label: 'builder', request: { parent, prompt: [] }, signal: request().signal }
  const receipt = { childId: 'stable-child', messageId: 'accepted' }
  const subagents = { async startActivation(received) {
    assert.deepEqual(received, { ...spec, delivery: 'parent' })
    return receipt
  } }
  assert.equal(await startTeammate(subagents, spec), receipt)
})

test('live discovery includes direct children and excludes descendant rows and diagnostics', async () => {
  const direct = { kind: 'child', id: 'direct', parentId: 'p', depth: 1, activity: 'running' }
  const signal = new AbortController().signal
  const subagents = { async listDescendants(parentId, received) {
    assert.equal(parentId, 'p')
    assert.equal(received, signal)
    return [direct,
      { kind: 'child', id: 'nested', depth: 2, activity: 'running' },
      { kind: 'unsupported', id: 'unknown', depth: 1 },
    ]
  } }
  assert.deepEqual(await directChildActivity(subagents, 'p', signal), [direct])
})
