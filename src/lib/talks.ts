// A dated log of calls, kept on each person as `talks` (one date per day with a call). It starts on the
// day this was added, so counts and streaks only cover calls from then on; older calls are only known
// through `lastTalk` and the coloured `history` dots.
import { weekStart } from './dates'
import type { Person } from './types'

const KEEP = 500

export const withTalk = (p: Person, day: string): Person =>
  p.talks?.includes(day) ? p : { ...p, talks: [...(p.talks ?? []), day].sort().slice(-KEEP) }

// Days with a call with this person in [from, to]; a last talk from before the log started still counts
const talkDays = (p: Person, from: string, to: string) => {
  const days = new Set((p.talks ?? []).filter((d) => d >= from && d <= to))
  if (p.lastTalk >= from && p.lastTalk <= to) days.add(p.lastTalk)
  return days.size
}

export function callsBetween(people: Person[], from: string, to: string) {
  const byPerson = people
    .map((p) => ({ name: p.name, n: talkDays(p, from, to) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
  return { total: byPerson.reduce((s, x) => s + x.n, 0), byPerson }
}

// Weeks in a row (Sunday to Saturday) with at least one logged call. The current week counts once it
// has a call; until then the streak is still alive from last week.
export function weekStreak(people: Person[], today: string) {
  const weeks = new Set(people.flatMap((p) => p.talks ?? []).map(weekStart))
  let week = weekStart(today)
  if (!weeks.has(week)) week = weekStart(addWeek(week, -1))
  let n = 0
  while (weeks.has(week)) {
    n++
    week = addWeek(week, -1)
  }
  return n
}

const addWeek = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + 7 * n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const firstLogged = (p: Person) => p.talks?.[0]
