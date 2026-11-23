import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import fs from 'fs-extra'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
import { EXPECTED_BINARY_VERSION } from '../installer'

const root = join(import.meta.dirname, '../../..')
const workflow = parse(await fs.readFile(join(root, '.github/workflows/publish.yml'), 'utf8'))
const gate = workflow.jobs['verify-preset']

it('requires an unprivileged preset check for both release tags and dry runs', () => {
  expect(workflow.jobs.publish.needs).toBe('verify-preset')
  expect(gate.permissions).toEqual({ contents: 'read' })
  expect(gate.if).toBeUndefined()
  const step = gate.steps.find((step: { run?: string }) => step.run === 'bash .github/scripts/check-preset.sh')
  expect(step).toBeDefined()
  expect(step.if).toBeUndefined()
})

it.skipIf(process.platform === 'win32').each(['matching', 'stale', 'unavailable', 'unreadable'])(
  'runs the publish gate offline (asset: %s)', async (state) => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ccg-preset-'))
    try {
      const url = 'https://github.com/GuYu-001/ccg-ros2-workflow/releases/download/preset/codeagent-wrapper-linux-amd64'
      const expected = state === 'matching' ? EXPECTED_BINARY_VERSION : '0.0.1'
      await fs.writeFile(join(dir, 'asset'), `#!/bin/sh\n[ "$1" = --version ] || exit 2\necho "codeagent-wrapper version ${expected}"\nexit ${state === 'unreadable' ? 1 : 0}\n`)
      await fs.writeFile(join(dir, 'curl'), `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) shift; dest="$1";; https:*) url="$1";; esac; shift; done\n[ "$url" = '${url}' ] || exit 2\n${state === 'unavailable' ? 'exit 22' : 'cp "$FIXTURE/asset" "$dest"'}\n`, { mode: 0o755 })
      const result = spawnSync('bash', ['.github/scripts/check-preset.sh'], {
        cwd: root, env: { ...process.env, FIXTURE: dir, PATH: dir + delimiter + process.env.PATH }, encoding: 'utf8',
      })
      expect(result.status).toBe(state === 'matching' ? 0 : 1)
      if (state === 'matching') expect(result.stdout).toContain(EXPECTED_BINARY_VERSION)
      else expect(result.stderr).toMatch(/build-binaries.*main/)
      if (state === 'stale') {
        expect(result.stderr).toContain(expected)
        expect(result.stderr).toContain(EXPECTED_BINARY_VERSION)
      }
    }
    finally { await fs.remove(dir) }
  },
)
