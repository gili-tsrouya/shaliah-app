// Fixed call days ("Grandma on Fridays"): when the next call is due, the repeating calendar event,
// and keeping that event in step with Google Calendar.
import type { CalEvent, Person } from './types'
import { addDays, daysBetween, fromISO, todayISO } from './dates'

export const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
export const DEFAULT_CALL_TIME = '18:00'
const CALL_MINUTES = 15

const weekday = (iso: string) => fromISO(iso).getDay()
const hasDays = (p: Person) => !!p.callDays?.length && p.everyDays > 1

// Weeks between repeats: weekly or more often → 1, every two weeks → 2, monthly → 4
export const weeksApart = (everyDays: number) => (everyDays >= 28 ? 4 : everyDays >= 14 ? 2 : 1)

// The date the next talk is due. Without fixed days: the chosen rhythm after the last talk.
// With fixed days: the first chosen weekday once most of the rhythm has passed, so a call a few days
// early counts (weekly on Fridays: called Thursday → due the Friday after next week's, not tomorrow).
export function nextCallDate(p: Person) {
  if (!hasDays(p)) return addDays(p.lastTalk, p.everyDays)
  let d = addDays(p.lastTalk, Math.max(1, p.everyDays - 3))
  for (let i = 0; i < 7 && !p.callDays!.includes(weekday(d)); i++) d = addDays(d, 1)
  return d
}

export const daysToNextCall = (p: Person, today = todayISO()) => daysBetween(today, nextCallDate(p))

export const callDaysLabel = (days: number[]) =>
  days.length === 1 ? `ביום ${WEEKDAY_NAMES[days[0]]}` : `בימים ${[...days].sort().map((d) => WEEKDAYS[d] + "'").join(', ')}`

const callTitle = (p: Person) => `שיחה עם ${p.name}`

// The calls shown in the app's own calendar for people whose call is not in Google Calendar yet
export function callEvents(people: Person[], synced: Record<string, unknown>, from: string, to: string): CalEvent[] {
  const out: CalEvent[] = []
  for (const p of people) {
    if (!hasDays(p) || synced[p.id]) continue
    const anchor = nextCallDate(p)
    const every = weeksApart(p.everyDays)
    // From the next due call on, like the repeating event in Google Calendar
    for (let d = anchor > from ? anchor : from; d <= to; d = addDays(d, 1)) {
      if (!p.callDays!.includes(weekday(d))) continue
      // Every two weeks / monthly: only the weeks in step with the next due call
      const weeks = Math.round(daysBetween(addDays(anchor, -weekday(anchor)), addDays(d, -weekday(d))) / 7)
      if (((weeks % every) + every) % every !== 0) continue
      out.push({ id: `call_${p.id}_${d}`, title: callTitle(p), work: 'personal', kind: 'event', date: d, start: p.callTime ?? DEFAULT_CALL_TIME })
    }
  }
  return out
}

// ----- Google Calendar -----

// What the Google event has to match; when this changes the event is updated
export const callSignature = (p: Person) =>
  hasDays(p) ? [p.name, [...p.callDays!].sort().join(''), p.callTime ?? DEFAULT_CALL_TIME, weeksApart(p.everyDays)].join('|') : ''

export function googleCallEvent(p: Person, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const first = nextCallDate(p)
  const start = p.callTime ?? DEFAULT_CALL_TIME
  const [h, m] = start.split(':').map(Number)
  const endMinutes = h * 60 + m + CALL_MINUTES
  const end = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
  const interval = weeksApart(p.everyDays)
  return {
    summary: callTitle(p),
    start: { dateTime: `${first}T${start}:00`, timeZone },
    end: { dateTime: `${first}T${end < start ? start : end}:00`, timeZone },
    recurrence: [`RRULE:FREQ=WEEKLY${interval > 1 ? `;INTERVAL=${interval}` : ''};BYDAY=${[...p.callDays!].sort().map((d) => BYDAY[d]).join(',')}`],
    extendedProperties: { private: { shaliachKind: 'event', shaliachCall: p.id } },
  }
}

export interface SyncedCall { googleId: string; calendarId: string; sig: string }

interface CallApi {
  create: (calendarId: string, body: object) => Promise<{ id: string }>
  update: (calendarId: string, googleId: string, body: object) => Promise<unknown>
  remove: (calendarId: string, googleId: string) => Promise<unknown>
}

// Makes Google Calendar match the people's fixed call days: one repeating event per person.
// Returns the new record of which event belongs to whom.
export async function syncCallEvents(people: Person[], synced: Record<string, SyncedCall>, calendarId: string, api: CallApi) {
  const next: Record<string, SyncedCall> = {}
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const [id, s] of Object.entries(synced)) {
    const p = byId.get(id)
    const sig = p ? callSignature(p) : ''
    if (p && sig && s.sig === sig && s.calendarId === calendarId) next[id] = s
    else if (p && sig && s.calendarId === calendarId) {
      try {
        await api.update(calendarId, s.googleId, googleCallEvent(p))
        next[id] = { ...s, sig }
      } catch {
        // Deleted in Google Calendar meanwhile: it is created again below
      }
    } else {
      // Person removed, days cleared, or the calendar changed
      await api.remove(s.calendarId, s.googleId).catch(() => {})
    }
  }
  for (const p of people) {
    const sig = callSignature(p)
    if (!sig || next[p.id]) continue
    const created = await api.create(calendarId, googleCallEvent(p))
    next[p.id] = { googleId: created.id, calendarId, sig }
  }
  return next
}
