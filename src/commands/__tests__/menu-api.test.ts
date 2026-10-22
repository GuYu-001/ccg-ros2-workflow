import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { showMainMenu } from '../menu'

const home = vi.hoisted(() => ({ path: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => home.path }
})

describe('API settings menu', () => {
  beforeEach(async () => {
    home.path = await fs.mkdtemp(join(tmpdir(), 'ccg-api-menu-'))
    await initI18n('en')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(home.path)
  })

  function answerMenu(apiProvider: string) {
    let opened = false
    return vi.spyOn(inquirer, 'prompt').mockImplementation((async (questions: any) => {
      switch (questions[0].name) {
        case 'action':
          if (opened) return { action: 'Q' }
          opened = true
          return { action: '4' }
        case 'apiProvider':
          return { apiProvider }
        case 'url':
          return { url: 'https://gateway.example.test', key: 'custom-test-key' }
        case 'continue':
          return { continue: '' }
        default:
          throw new Error(`Unexpected prompt: ${questions[0].name}`)
      }
    }) as any)
  }

  it('offers only official authentication and user-configured endpoints', async () => {
    const prompt = answerMenu('official')
    await showMainMenu()
    const question = prompt.mock.calls.flatMap(([questions]: any) => questions).find((q: any) => q.name === 'apiProvider')
    expect(question.choices.map((choice: any) => choice.value)).toEqual(['official', 'thirdparty', 'gemini-cli'])
  })

  it('saves a custom API while retaining unrelated user settings', async () => {
    const settingsPath = join(home.path, '.claude', 'settings.json')
    await fs.outputJson(settingsPath, { env: { USER_FLAG: 'keep' }, permissions: { allow: ['Read'] } })
    answerMenu('thirdparty')
    await showMainMenu()
    const settings = await fs.readJson(settingsPath)
    expect(settings.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://gateway.example.test',
      ANTHROPIC_AUTH_TOKEN: 'custom-test-key',
      USER_FLAG: 'keep',
    })
    expect(settings.permissions.allow).toContain('Read')
  })

  it('clears only API credentials when switching back to official authentication', async () => {
    const settingsPath = join(home.path, '.claude', 'settings.json')
    await fs.outputJson(settingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example.test',
        ANTHROPIC_AUTH_TOKEN: 'old-token',
        ANTHROPIC_API_KEY: 'old-key',
        USER_FLAG: 'keep',
      },
    })
    answerMenu('official')
    await showMainMenu()
    const settings = await fs.readJson(settingsPath)
    expect(settings.env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(settings.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(settings.env.USER_FLAG).toBe('keep')
  })
})
