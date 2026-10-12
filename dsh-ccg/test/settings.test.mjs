import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import { Config, readConfig, apply } from '../src/index.js'

test('the real schema exposes all card fields as profile-editable references', () => {
  const config = Config({ strong: { provider: 'gw', model: 'reasoner' }, team: false })
  for (const key of ['strong', 'worker', 'roles', 'team']) {
    assert.equal(Config.dict[key].meta.volatile, true)
    assert.equal(typeof config[key].get, 'function')
  }
  const snapshot = readConfig(config)
  assert.equal(snapshot.team, false)
  assert.deepEqual(snapshot.strong, { provider: 'gw', model: 'reasoner' })
  assert.equal(snapshot.maxDepth, 2)
})

test('a Loader commit is read on the next operation without losing ordinary config', () => {
  const config = Config({ team: true, maxDepth: 4 })
  const before = readConfig(config)
  updateVolatile(config.team, createVolatile(false))
  updateVolatile(config.worker, createVolatile({ provider: 'gw', model: 'fast' }))
  const after = readConfig(config)
  assert.equal(before.team, true)
  assert.equal(after.team, false)
  assert.equal(after.maxDepth, 4)
  assert.deepEqual(after.worker, { provider: 'gw', model: 'fast' })
})

test('Loader validation rejects an invalid matrix before retiring the live tools', () => {
  const listeners = new Map()
  const fiber = {}
  const ctx = { fiber,
    on: (event, handler) => listeners.set(event, handler),
    plugin: () => ({ dispose: async () => {} }),
    effect: () => {}, inject: () => {},
  }
  apply(ctx, Config({}))
  const validate = (raw) => listeners.get('internal/config').call(fiber, raw, () => raw)
  assert.throws(() => validate({ roles: { typo: {} } }), /unknown role/)
  assert.throws(() => validate({ roles: { reviewer: { context: 'inherit', models: [
    { provider: 'gw', model: 'a' }, { provider: 'gw', model: 'b' },
  ] } } }), /panel/)
  assert.deepEqual(validate({ team: false }), { team: false })
})
