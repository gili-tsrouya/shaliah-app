// Talking to Google: the connect flow, token renewal, and turning one of our events into a Google event.
import { b64url, sha256 } from './crypto.ts'

// Minimal access: read and write events, and read the list of calendar names so a category can be linked.
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

export class GoogleAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

export async function pkceChallenge(verifier: string) {
  return b64url(await sha256(verifier))
}

export function authUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // asks for a refresh token, so the connection lasts
    prompt: 'consent', // Google only returns a refresh token when consent is shown
    include_granted_scopes: 'false',
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new GoogleAuthError(json.error ?? `http_${res.status}`, json.error_description ?? 'token request failed')
  return json as { access_token: string; refresh_token?: string; scope?: string; expires_in: number }
}

export const exchangeCode = (p: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }) =>
  tokenRequest({ grant_type: 'authorization_code', code: p.code, code_verifier: p.verifier, client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: p.redirectUri })

// "invalid_grant" here means the user revoked access or the token expired: they must reconnect
export const refreshAccess = (p: { refreshToken: string; clientId: string; clientSecret: string }) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: p.refreshToken, client_id: p.clientId, client_secret: p.clientSecret })

export async function revoke(token: string) {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => {})
}

export interface OurEvent {
  id: string
  title: string
  date: string // yyyy-mm-dd
  end_date: string | null
  start_time: string | null // HH:mm[:ss]
  end_time: string | null
}

// Google accepts ids made of 0-9 and a-v; a uuid without dashes fits. The same event always gets the
// same Google id, so a retry can never create a second copy.
export const googleEventId = (uuid: string) => uuid.replace(/-/g, '').toLowerCase()

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t)

export function eventBody(e: OurEvent, timeZone: string) {
  const base = { summary: e.title, status: 'confirmed', extendedProperties: { private: { shaliahEventId: e.id } } }
  if (!e.start_time) {
    // all-day: Google's end date is the day after the last day
    return { ...base, start: { date: e.date }, end: { date: addDays(e.end_date ?? e.date, 1) } }
  }
  const start = `${e.date}T${hhmmss(e.start_time)}`
  let endDay = e.end_date ?? e.date
  let endTime = e.end_time ? hhmmss(e.end_time) : null
  if (!endTime) {
    // no end time: one hour, rolling over midnight if needed
    const d = new Date(`${start}Z`)
    d.setUTCHours(d.getUTCHours() + 1)
    endDay = d.toISOString().slice(0, 10)
    endTime = d.toISOString().slice(11, 19)
  } else if (endDay === e.date && endTime <= hhmmss(e.start_time)) {
    endDay = addDays(e.date, 1) // ends after midnight
  }
  return { ...base, start: { dateTime: start, timeZone }, end: { dateTime: `${endDay}T${endTime}`, timeZone } }
}

export async function calendarFetch(accessToken: string, path: string, init: RequestInit = {}) {
  return await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}
