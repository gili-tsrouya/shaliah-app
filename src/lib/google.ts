// Two-way Google Calendar sync straight from the browser (no server).
// Uses Google Identity Services for a short-lived access token and the Calendar REST API.
import type { CalEvent, EventKind, Guest, Work } from './types'
import { addDays } from './dates'
import { cloud, maybeSignedIn } from './cloud'

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

// The lasting connection: when Google was connected through the account, the server keeps the
// permission and hands out a fresh one-hour token whenever the app needs one, with no Google window.
// Returns null when there is no such connection (or no account); the app then works as before.
let noServerUntil = 0
export async function serverToken(): Promise<string | null> {
  if (!maybeSignedIn() || Date.now() < noServerUntil) return null
  try {
    const { data, error } = await (await cloud()).functions.invoke('google-token', { body: {} })
    const token = (data as { access_token?: string; expires_in?: number } | null)?.access_token
    if (error || !token) {
      noServerUntil = Date.now() + 10 * 60_000 // not connected this way: do not ask again for a while
      return null
    }
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + ((data as { expires_in?: number }).expires_in ?? 3600) * 1000 }))
    } catch {
      // token stays in memory only
    }
    return token
  } catch {
    return null
  }
}

// Sends the browser to Google once to grant the lasting permission; Google returns to the app's calendar
export async function startServerConnect() {
  const { data, error } = await (await cloud()).functions.invoke('google-connect-start', { body: {} })
  const url = (data as { url?: string } | null)?.url
  if (error || !url) throw new Error('could not start')
  noServerUntil = 0
  sessionStorage.setItem('shaliach-return', '#/calendar')
  location.href = url
}

export async function disconnectServer() {
  if (!maybeSignedIn()) return
  await (await cloud()).functions.invoke('google-disconnect', { body: {} }).catch(() => {})
  noServerUntil = 0
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
  attendees?: { email: string; responseStatus?: Guest['status']; self?: boolean; organizer?: boolean; resource?: boolean }[]
  organizer?: { email?: string; self?: boolean }
  hangoutLink?: string
}

// Guests other than Gili herself, and who organized the event if it was not her
function peopleOf(g: GEvent) {
  const guests = (g.attendees ?? []).filter((a) => !a.self && !a.resource).map((a) => ({ email: a.email, status: a.responseStatus }))
  return {
    guests,
    meetLink: g.hangoutLink,
    invitedBy: g.organizer && !g.organizer.self ? g.organizer.email : undefined,
    myStatus: g.organizer && !g.organizer.self ? (g.attendees ?? []).find((a) => a.self)?.responseStatus : undefined,
  }
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
      endDate: endDate > g.start.date ? endDate : undefined, ...peopleOf(g),
    }
  }
  const s = localDate(g.start.dateTime!)
  const e = localDate(g.end.dateTime ?? g.start.dateTime!)
  return {
    id: `g_${calendarId}_${g.id}`, googleId: g.id, googleCalendarId: calendarId, work, title: g.summary || '(ללא כותרת)',
    kind: kind ?? 'event', date: s.date, start: s.time, end: kind === 'deadline' ? undefined : e.time, ...peopleOf(g),
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
  // The guest list is sent only for her own events, and only when the app knows it (left out, Google keeps it)
  if (e.guests && !e.invitedBy) body.attendees = e.guests.map((g) => ({ email: g.email }))
  if (e.meet && !e.meetLink) body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  return JSON.stringify(body)
}

// Google emails guests only when asked to: invitations, changes and cancellations
const notify = (e: CalEvent | undefined) => (e?.guests?.length && !e.invitedBy ? 'all' : 'none')
const query = (e: CalEvent) => `?sendUpdates=${notify(e)}${e.meet ? '&conferenceDataVersion=1' : ''}`

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
  api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events${query(e)}`, { method: 'POST', body: toGoogle(e) })

// `before` is the event as it was: guests who were removed also get a cancellation
export const updateEvent = (token: string, calendarId: string, googleId: string, e: CalEvent, before?: CalEvent) => {
  const tell = notify(e) === 'all' || notify(before) === 'all'
  const q = `?sendUpdates=${tell ? 'all' : 'none'}${e.meet ? '&conferenceDataVersion=1' : ''}`
  return api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}${q}`, { method: 'PATCH', body: toGoogle(e) })
}

// Events built elsewhere (e.g. repeating calls, see src/lib/calls.ts)
export const createRawEvent = (token: string, calendarId: string, body: object) =>
  api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body) })

export const updateRawEvent = (token: string, calendarId: string, googleId: string, body: object) =>
  api<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}`, { method: 'PUT', body: JSON.stringify(body) })

// Deleting an event she invited people to sends them a cancellation
export const deleteEvent = (token: string, calendarId: string, googleId: string, e?: CalEvent) =>
  api<void>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}?sendUpdates=${notify(e)}`, { method: 'DELETE' })

// Her reply to someone else's invitation. Google takes the whole guest list back, so the event is read
// first and only her own answer is changed; the organizer is told.
export async function respond(token: string, calendarId: string, googleId: string, status: 'accepted' | 'declined' | 'tentative') {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}`
  const g = await api<GEvent>(token, path)
  const attendees = (g.attendees ?? []).map((a) => (a.self ? { ...a, responseStatus: status } : a))
  if (!attendees.some((a) => a.self)) throw new Error('not invited')
  return api<GEvent>(token, `${path}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify({ attendees }) })
}
