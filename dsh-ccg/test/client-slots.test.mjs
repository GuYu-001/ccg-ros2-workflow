/** Browser registrations exercised through the current official UI runtime. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'

// The release matrix can point this test at separate, unmodified npm installs.
const require = createRequire(process.env.DSH_CLIENT_TEST_RUNTIME
  ? resolve(process.env.DSH_CLIENT_TEST_RUNTIME, 'package.json')
  : new URL('../package.json', import.meta.url))
const { Context } = await import(require.resolve('@deepseek-ai/cordis'))
const slotRuntime = await import(require.resolve('@deepseek-ai/dsh-client-ui-slots'))
const React = require('react')
const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

/** Load a browser factory exactly as the harness ModuleLoader does. */
function browserModule(text, fetch = async () => ({ ok: true, json: async () => ({ panels: {} }) }), react = React) {
  let definition
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
  }
  vm.runInNewContext(text, {
    window: { __ModuleLoader__: { load: (value) => { definition = value } } },
    document, fetch, setInterval, clearInterval,
  })
  assert.ok(definition?.factory, 'browser module did not register a factory')
  return definition.factory((id) => id === 'react' ? react : id === '@deepseek-ai/dsh-client-ui-slots'
    ? slotRuntime
    : id === '@deepseek-ai/cordis' ? { Context, Service: require('@deepseek-ai/cordis').Service }
      : require(id))
}

const { SlotRegistry } = browserModule(readFileSync(
  require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'), 'utf8',
))
const pluginsModule = browserModule(readFileSync(
  require.resolve('@deepseek-ai/dsh-client-ui-settings-plugins/client'), 'utf8',
))

/** Locale data is plugin-owned; the registration lifecycle remains real Cordis. */
function locale() {
  const dictionaries = new Map()
  return {
    bind: (namespace) => (key) => dictionaries.get(namespace)?.en?.[key] ?? key,
    register: (namespace, value) => {
      dictionaries.set(namespace, value)
      return () => dictionaries.delete(namespace)
    },
    getSnapshot: () => ({ revision: 1 }),
    subscribe: () => () => {},
  }
}

async function bench(payload = { panels: {} }, fetch, react) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', locale())
  const slots = ctx.get('slots')
  // Shell-owned ancestors. The Plugins child declaration itself must come
  // from the official plugin below, never a copied/mock declaration.
  slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    },
  }, () => null)
  const plugins = ctx.plugin(pluginsModule)
  await plugins.await()
  const ccgModule = browserModule(source, fetch ?? (async () => ({ ok: true, json: async () => payload })), react)
  const ccg = ctx.plugin(ccgModule)
  await ccg.await()
  // Panel claims arrive after one asynchronous configuration read.
  await new Promise((done) => setImmediate(done))
  return { ctx, slots, ccg, plugins }
}

test('the CCG card appears in the official Plugins tab roster with a visible label', async () => {
  const { slots, ccg, plugins } = await bench()
  try {
    const pages = slots.entries('settings.plugins.tab')
    assert.equal(pages.length, 1)
    assert.equal(pages[0].options.id, 'ccg')
    assert.equal(slotRuntime.resolveSlotLabel(pages[0].options.label), 'CCG role matrix')
    const section = slots.entries('settings.section').find((entry) => entry.options.id === 'plugins')
    assert.ok(section, 'official Plugins section did not mount')
    const tabs = section.inject().hooks.tabs.getSnapshot()
    assert.equal(tabs.length, 1)
    assert.equal(tabs[0].id, 'ccg')
    assert.equal(tabs[0].label, 'CCG role matrix')
    assert.doesNotMatch(source, /settings\.plugin\.item/)
  } finally {
    await ccg.dispose()
    await plugins.dispose()
  }
})

test('panel and team entries retain their dispatch identities and unload with CCG', async () => {
  const { slots, ccg, plugins } = await bench({
    panels: { ccg_analyze: [{ provider: 'one', model: 'model-a' }] },
  })
  try {
    const panels = slots.entries('tool.call.toolview')
    assert.equal(panels.length, 1)
    assert.equal(panels[0].options.key, 'ccg_analyze')
    assert.equal(panels[0].inject().roster[0].model, 'model-a')
    assert.equal(slots.entries('conversation.input.dock')[0].options.id, 'ccg-team')
    await ccg.dispose()
    assert.equal(slots.entries('settings.plugins.tab').length, 0)
    assert.equal(slots.entries('tool.call.toolview').length, 0)
    assert.equal(slots.entries('conversation.input.dock').length, 0)
  } finally {
    await ccg.dispose()
    await plugins.dispose()
  }
})

test('panel views render current preparation, start and persisted result phases', async () => {
  const { slots, ccg, plugins } = await bench({ panels: { ccg_analyze: [] } })
  try {
    const entry = slots.entries('tool.call.toolview')[0]
    const { renderToStaticMarkup } = require('react-dom/server')
    const injected = entry.inject()
    const render = (props) => renderToStaticMarkup(React.createElement(entry.component, { ...injected, ...props }))
    for (const phase of ['preparing', 'start']) {
      const html = render({ phase, block: { argsRaw: '{"description":"Compare models"}' } })
      assert.match(html, /data-state="running"/)
      assert.match(html, /Compare models/)
    }
    const html = render({
      phase: 'result',
      block: {
        kind: 'tool-result', isError: false, call: null,
        content: [{ type: 'text', text: 'fallback' }],
        meta: {
          kind: 'ccg.panel/1', question: 'Compare models',
          answers: [
            { ok: true, label: 'one', provider: 'p', model: 'a', answer: 'First answer' },
            { ok: true, label: 'two', provider: 'p', model: 'b', answer: 'Second answer' },
          ],
        },
      },
    })
    assert.match(html, /data-state="ok"/)
    assert.match(html, /First answer/)
    assert.match(html, /Second answer/)
    assert.doesNotMatch(html, /fallback/)
  } finally {
    await ccg.dispose()
    await plugins.dispose()
  }
})

/** Minimal deterministic Hooks runner for the editor's request/state seam. */
function editorHooks() {
  const state = []
  let cursor = 0
  let effects = []
  const changed = (previous, deps) => !previous || deps.some((value, i) => !Object.is(value, previous[i]))
  const memo = (create, deps) => {
    const index = cursor++
    if (changed(state[index]?.deps, deps)) state[index] = { deps, value: create() }
    return state[index].value
  }
  const react = {
    ...React,
    useState: (initial) => {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
    },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const index = cursor++
      if (changed(state[index], deps)) { state[index] = deps; effects.push(fn) }
    },
  }
  return {
    react,
    render: (entry) => {
      cursor = 0
      const tree = entry.component(entry.inject())
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      return tree
    },
  }
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  const children = Array.isArray(tree.props?.children) ? tree.props.children : [tree.props?.children]
  return [tree, ...children.flatMap((child) => Array.isArray(child) ? child.flatMap(nodes) : nodes(child))]
}

test('saving sends the observed revision and rebases only edited fields after a conflict', async () => {
  const initial = {
    revision: 1, writable: true, panels: {}, models: [], roles: [], team: { enabled: true },
    tiers: { strong: { provider: 'p', model: 'a' }, worker: { provider: 'p', model: 'b' } },
  }
  const refreshed = { ...initial, revision: 2, tiers: { ...initial.tiers, worker: { provider: 'p', model: 'other-editor' } } }
  const requests = []
  const fetch = async (_url, options) => {
    if (options?.method === 'POST') {
      requests.push(JSON.parse(options.body))
      return requests.length === 1
        ? { status: 409, ok: false, json: async () => ({ error: 'settings revision mismatch' }) }
        : { status: 200, ok: true, json: async () => ({ ...refreshed, revision: 3 }) }
    }
    return { ok: true, json: async () => requests.length ? refreshed : initial }
  }
  const hooks = editorHooks()
  const { slots, ccg, plugins } = await bench(initial, fetch, hooks.react)
  try {
    const entry = slots.entries('settings.plugins.tab')[0]
    hooks.render(entry)
    await new Promise((done) => setImmediate(done))
    let tree = hooks.render(entry)
    nodes(tree).filter((node) => node.type === 'select')[0].props.onChange({ target: { value: '["p","my-edit"]' } })
    tree = hooks.render(entry)
    await nodes(tree).find((node) => node.props?.children === 'Save').props.onClick()
    assert.equal(requests[0].expectedRevision, 1)
    assert.equal(requests[0].strong.model, 'my-edit')
    tree = hooks.render(entry)
    const selects = nodes(tree).filter((node) => node.type === 'select')
    assert.equal(selects[0].props.value, '["p","my-edit"]')
    assert.equal(selects[1].props.value, '["p","other-editor"]')
    assert.ok(nodes(tree).some((node) => typeof node.props?.children === 'string'
      && node.props.children.includes('settings revision mismatch')))
    await nodes(tree).find((node) => node.props?.children === 'Save').props.onClick()
    assert.equal(requests[1].expectedRevision, 2)
    assert.equal(requests[1].strong.model, 'my-edit')
    assert.equal(requests[1].worker, undefined, 'retry must not revert the other editor’s change')
  } finally {
    await ccg.dispose()
    await plugins.dispose()
  }
})
