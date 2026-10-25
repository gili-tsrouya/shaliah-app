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

// "Run now": starts .github/workflows/run-agent.yml. The token also needs "Actions: read and write".
const RUNS = 'https://api.github.com/repos/Gili-tsrouya/shaliah-app/actions/workflows/run-agent.yml'

export async function startAgentRun(token: string, agent: 'deals' | 'shlichut') {
  const r = await fetch(RUNS + '/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ ref: 'main', inputs: { agent } }),
  })
  if (!r.ok) throw new Error(String(r.status))
}

export interface AgentRun { status: 'queued' | 'in_progress' | 'completed' | string; conclusion: string | null; created_at: string; html_url: string; name: string; display_title: string }

// The newest run of that agent started at or after `since`
export async function findAgentRun(token: string, agent: string, since: string): Promise<AgentRun | null> {
  const r = await fetch(`${RUNS}/runs?per_page=10&created=>=${since.slice(0, 19)}Z`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store',
  })
  if (!r.ok) throw new Error(String(r.status))
  const runs = ((await r.json()) as { workflow_runs: AgentRun[] }).workflow_runs
  // run-name in the workflow is "Run <agent> agent"
  return runs.find((x) => x.display_title === `Run ${agent} agent`) ?? null
}
