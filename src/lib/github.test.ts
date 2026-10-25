import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATA_REPO, SETTINGS_FILES, loadAgentSettings, saveAgentSettings, settingsUrl } from './github'
import type { AgentSettings } from './types'

const settings: AgentSettings = { home: 'Town', lat: 1, lng: 2, rangeMiles: 10, maxPrice: 10, topics: [], extra: '' }

afterEach(() => vi.unstubAllGlobals())

describe('settings storage on GitHub', () => {
  it('targets the private data repository, never the public app repository', () => {
    expect(DATA_REPO).not.toMatch(/shaliah-app$/i)
    for (const path of Object.values(SETTINGS_FILES)) {
      expect(settingsUrl(path)).toBe(`https://api.github.com/repos/${DATA_REPO}/contents/${path}`)
    }
  })

  it('refuses any path other than the two settings files', () => {
    for (const path of ['src/App.tsx', '.github/workflows/deploy.yml', 'public/agent-settings.json', 'settings/../package.json']) {
      expect(() => settingsUrl(path as never)).toThrow()
    }
  })

  it('writes the agent settings only to the data repository', async () => {
    const calls: { url: string; method: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' })
      return new Response(JSON.stringify({ sha: 'abc' }), { status: 200 })
    }))
    await saveAgentSettings('token', settings)
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT'])
    for (const c of calls) expect(c.url).toBe(settingsUrl(SETTINGS_FILES.agent))
  })

  it('does not contact GitHub without a token', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await loadAgentSettings(undefined)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
