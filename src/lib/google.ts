// Two-way Google Calendar sync straight from the browser (no server).
// Uses Google Identity Services for a short-lived access token and the Calendar REST API.
import type { CalEvent, EventKind, Work } from './types'
import { addDays } from './dates'

const SCOPE = 'https://www.googleapis.com/auth/calendar'
const API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_KEY = 'shaliach:googleToken'

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void }) => TokenClient } } }
  }
}

let client: TokenClient | null = null
let clientFor = ''

function loadScript() {
  if (window.google?.accounts) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('לא הצלחתי לטעון את Google'))
    document.head.appendChild(s)
  })
}

// Kept in localStorage so closing the app (which iOS does often) does not sign out; Google tokens still expire after ~1 hour
export function storedToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as { token: string; exp: number } | null
    return t && t.exp > Date.now() + 60_000 ? t.token : null
  } catch {
    return null
  }
}

// prompt '' = reuse the existing Google session silently when possible
export async function connect(clientId: string, prompt: '' | 'consent' = '') {
  await loadScript()
  if (!client || clientFor !== clientId) {
    client = window.google!.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} })
    clientFor = clientId
  }
  return new Promise<string>((resolve, reject) => {
    client!.callback = (r) => {
      if (!r.access_token) return reject(new Error(r.error || 'החיבור בוטל'))
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }))
      } catch {
        // token stays in memory only
      }
      resolve(r.access_token)
    }
    client!.requestAccessToken({ prompt })
  })
}

export function disconnect() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nothing stored
  }
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (r.status === 401) {
    disconnect()
    throw new Error('expired')
  }
  if (!r.ok) throw new Error(`Google ${r.status}`)
  return r.status === 204 ? (undefined as T) : r.json()
}

export interface GoogleCalendar { id: string; summary: string; primary?: boolean }

export const listCalendars = (token: string) =>
  api<{ items: GoogleCalendar[] }>(token, '/users/me/calendarList?minAccessRole=writer').then((r) => r.items)

interface GEvent {
  id: string
  summary?: string
  status?: string
  start: { date?: string; dateTime?: string }
  end: { date?: string; dateTime?: string }
  extendedProperties?: { private?: { shaliachKind?: EventKind } }
}

const localDate = (dt: string) => {
  const d = new Date(dt)
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

function fromGoogle(g: GEvent, calendarId: string, work: Work): CalEvent {
  const kind = g.extendedProperties?.private?.shaliachKind
  if (g.start.date) {
    // All-day: Google's end date is exclusive
    const endDate = addDays(g.end.date ?? g.start.date, -1)
    return {
      id: `g_${calendarId}_${g.id}`, googleId: g.id, googleCalendarId: calendarId, work, title: g.summary || '(ללא כותרת)',
      kind: kind ?? (endDate > g.start.date ? 'vacation' : 'event'), date: g.start.date,
      endDate: endDate > g.start.date ? endDate : undefined,
    }
  }
  const s = localDate(g.start.dateTime!)
  const e = localDate(g.end.dateTime ?? g.start.dateTime!)
  return {
    id: `g_${calendarId}_${g.id}`, googleId: g.id, googleCalendarId: calendarId, work, title: g.summary || '(ללא כותרת)',
    kind: kind ?? 'event', date: s.date, start: s.time, end: kind === 'deadline' ? undefined : e.time,
  }
}

function toGoogle(e: CalEvent) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const body: Record<string, unknown> = { summary: e.title, extendedProperties: { private: { shaliachKind: e.kind } } }
  if (e.kind === 'vacation' || !e.start) {
    body.start = { date: e.date }
    body.end = { date: addDays(e.endDate ?? e.date, 1) }
  } else {
    const end = e.end ?? e.start
    body.start = { dateTime: `${e.date}T${e.start}:00`, timeZone: tz }
    body.end = { dateTime: `${e.date}T${end < e.start ? e.start : end}:00`, timeZone: tz }
  }
  return JSON.stringify(body)
}

// Events of one calendar between two dates (inclusive)
export async function fetchEvents(token: string, calendarId: string, work: Work, from: string, to: string) {
  const q = new URLSearchParams({
    timeMin: new Date(from + 'T00:00:00').toISOString(),
    timeMax: new Date(addDays(to, 1) + 'T00:00:00').toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  })
  const r = await api<{ items: GEvent[] }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`)
  return r.items.filter((g) => g.status !== 'cancelled').map((g) => fromGoogle(g, calendarId, work))
}

export const createEvent = (token: string, calendarId: string, e: CalEvent) =>
  api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: toGoogle(e) })

export const updateEvent = (token: string, calendarId: string, googleId: string, e: CalEvent) =>
  api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}`, { method: 'PATCH', body: toGoogle(e) })

export const deleteEvent = (token: string, calendarId: string, googleId: string) =>
  api<void>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}`, { method: 'DELETE' })
