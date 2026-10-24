// Saves the deals-agent settings into the repo (public/agent-settings.json), where the daily agent reads them.
// Needs a fine-grained GitHub token limited to this one repo with "Contents: read and write".
import type { AgentSettings } from './types'

const FILE = 'https://api.github.com/repos/Gili-tsrouya/shaliah-app/contents/public/agent-settings.json'

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

export async function saveAgentSettings(token: string, settings: AgentSettings) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const current = await fetch(FILE, { headers })
  const sha = current.ok ? ((await current.json()) as { sha: string }).sha : undefined
  const r = await fetch(FILE, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Update deals agent settings from the app',
      content: toBase64(JSON.stringify(settings, null, 2) + '\n'),
      sha,
    }),
  })
  if (!r.ok) throw new Error(`GitHub ${r.status}`)
}

export async function loadAgentSettings(): Promise<AgentSettings | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}agent-settings.json`, { cache: 'no-cache' })
    return r.ok ? r.json() : null
  } catch {
    return null
  }
}
