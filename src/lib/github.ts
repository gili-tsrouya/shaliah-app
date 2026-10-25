// Saves the settings the daily agents read (search area, interests, partnerships) to a PRIVATE data
// repository that only the owner and the agents can read. The app's own repository is public and its
// public/ folder is served to everyone, so personal settings must never be written there.
// Needs a fine-grained GitHub token limited to the data repository with "Contents: read and write".
import type { AgentSettings, Partnership } from './types'

export const DATA_REPO = 'Gili-tsrouya/shaliah-data'

// The only files the app may write, so a token in the browser can never be used to change app code
export const SETTINGS_FILES = {
  agent: 'settings/agent-settings.json',
  shlichut: 'settings/shlichut-settings.json',
} as const

type SettingsFile = (typeof SETTINGS_FILES)[keyof typeof SETTINGS_FILES]

export function settingsUrl(path: SettingsFile) {
  if (!Object.values(SETTINGS_FILES).includes(path)) throw new Error('not a settings file')
  return `https://api.github.com/repos/${DATA_REPO}/contents/${path}`
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' })

async function saveSettingsFile(token: string, path: SettingsFile, data: unknown, message: string) {
  const url = settingsUrl(path)
  const current = await fetch(url, { headers: headers(token), cache: 'no-store' })
  const sha = current.ok ? ((await current.json()) as { sha: string }).sha : undefined
  const r = await fetch(url, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message, content: toBase64(JSON.stringify(data, null, 2) + '\n'), sha }),
  })
  if (!r.ok) throw new Error(`GitHub ${r.status}`)
}

async function loadSettingsFile<T>(token: string | undefined, path: SettingsFile): Promise<T | null> {
  if (!token) return null
  try {
    const r = await fetch(settingsUrl(path), { headers: { ...headers(token), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

export const saveAgentSettings = (token: string, settings: AgentSettings) =>
  saveSettingsFile(token, SETTINGS_FILES.agent, settings, 'Update deals agent settings from the app')

export const loadAgentSettings = (token: string | undefined) => loadSettingsFile<AgentSettings>(token, SETTINGS_FILES.agent)

export interface ShlichutSettings { updatedAt: string; partnerships: Partnership[] }

export const saveShlichutSettings = (token: string, settings: ShlichutSettings) =>
  saveSettingsFile(token, SETTINGS_FILES.shlichut, settings, 'Update shlichut partnerships from the app')

export const loadShlichutSettings = (token: string | undefined) => loadSettingsFile<ShlichutSettings>(token, SETTINGS_FILES.shlichut)
