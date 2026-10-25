// Saves settings the daily agents read into the repo (under public/), where the agents pick them up.
// Needs a fine-grained GitHub token limited to this one repo with "Contents: read and write".
// The repo is public, so only what the agents need goes into these files.
import type { AgentSettings, Partnership } from './types'

const CONTENTS = 'https://api.github.com/repos/Gili-tsrouya/shaliah-app/contents/'

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

async function saveRepoFile(token: string, path: string, data: unknown, message: string) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const current = await fetch(CONTENTS + path, { headers, cache: 'no-store' })
  const sha = current.ok ? ((await current.json()) as { sha: string }).sha : undefined
  const r = await fetch(CONTENTS + path, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: toBase64(JSON.stringify(data, null, 2) + '\n'), sha }),
  })
  if (!r.ok) throw new Error(`GitHub ${r.status}`)
}

async function loadPublic<T>(file: string): Promise<T | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${file}`, { cache: 'no-cache' })
    return r.ok ? r.json() : null
  } catch {
    return null
  }
}

export const saveAgentSettings = (token: string, settings: AgentSettings) =>
  saveRepoFile(token, 'public/agent-settings.json', settings, 'Update deals agent settings from the app')

export const loadAgentSettings = () => loadPublic<AgentSettings>('agent-settings.json')

export interface ShlichutSettings { updatedAt: string; partnerships: Partnership[] }

export const saveShlichutSettings = (token: string, settings: ShlichutSettings) =>
  saveRepoFile(token, 'public/shlichut-settings.json', settings, 'Update shlichut partnerships from the app')

export const loadShlichutSettings = () => loadPublic<ShlichutSettings>('shlichut-settings.json')
