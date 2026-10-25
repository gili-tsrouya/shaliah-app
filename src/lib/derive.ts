import type { CalEvent, Expense, Person, TouchGrade, Work } from './types'
import { COLORS } from './types'
import { daysBetween, daysLeftInMonth, monthKey, todayISO } from './dates'

// savingGoal is set aside first, so the daily pace only spreads what is left after it
export function budgetSummary(expenses: Expense[], monthlyBudget: number, today = todayISO(), savingGoal = 0) {
  const month = monthKey(today)
  const thisMonth = expenses.filter((e) => monthKey(e.date) === month)
  const gross = thisMonth.filter((e) => !e.refund).reduce((s, e) => s + e.amount, 0)
  const refunds = thisMonth.filter((e) => e.refund).reduce((s, e) => s + e.amount, 0)
  const spent = gross - refunds
  const remaining = monthlyBudget - spent
  const daysLeft = daysLeftInMonth(today)
  return { thisMonth, gross, refunds, spent, remaining, daysLeft, perDay: Math.max(0, remaining - savingGoal) / daysLeft }
}

// Net spending in one budget category (refunds are booked against the category they came back to)
export const spentInCategory = (thisMonth: Expense[], id: string) =>
  thisMonth.filter((e) => e.categoryId === id).reduce((s, e) => s + (e.refund ? -e.amount : e.amount), 0)

// Positive = days until the next talk is due, 0 = today, negative = overdue
export const daysUntilDue = (p: Person, today = todayISO()) => p.everyDays - daysBetween(p.lastTalk, today)

// Most neglected first, relative to the rhythm chosen for each person
export const sortByPriority = (people: Person[], today = todayISO()) =>
  [...people].sort((a, b) => daysBetween(b.lastTalk, today) / b.everyDays - daysBetween(a.lastTalk, today) / a.everyDays)

// How a talk today rates against the chosen rhythm
export const gradeNow = (p: Person, today = todayISO()): TouchGrade => {
  const ago = daysBetween(p.lastTalk, today)
  return ago <= p.everyDays ? 'g' : ago <= p.everyDays * 1.5 ? 'y' : 'r'
}

export const GRADE_COLORS: Record<TouchGrade, string> = { g: '#16A34A', y: '#EAB308', r: '#DC2626' }

// 0–100; people without history yet count as on track
export const touchScore = (history: TouchGrade[] | undefined) => {
  if (!history?.length) return 100
  return Math.round(history.reduce((t, g) => t + (g === 'g' ? 100 : g === 'y' ? 50 : 0), 0) / history.length)
}

export const scoreColor = (score: number) => (score >= 80 ? GRADE_COLORS.g : score >= 50 ? GRADE_COLORS.y : GRADE_COLORS.r)

export const eventsOn = (events: CalEvent[], date: string, visible?: Record<Work, boolean>) =>
  events
    .filter((e) => (e.kind === 'vacation' || e.endDate ? e.date <= date && date <= (e.endDate ?? e.date) : e.date === date))
    .filter((e) => !visible || visible[e.work] !== false)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

export const colorOf = (key: string) => COLORS[key] ?? COLORS.gray

export const FREQUENCIES = [
  { days: 1, label: 'כל יום' },
  { days: 3, label: 'פעמיים בשבוע' },
  { days: 7, label: 'פעם בשבוע' },
  { days: 14, label: 'פעם בשבועיים' },
  { days: 30, label: 'פעם בחודש' },
]

export const freqLabel = (days: number) => FREQUENCIES.find((f) => f.days === days)?.label ?? `כל ${days} ימים`

// Rough outline of the five boroughs: east of the Hudson, plus Staten Island (keeps Jersey City/Newark out)
export const inNyc = (p: { lat: number; lng: number }) =>
  (p.lat >= 40.49 && p.lat <= 40.92 && p.lng >= -74.02 && p.lng <= -73.7) ||
  (p.lat >= 40.49 && p.lat <= 40.65 && p.lng >= -74.26 && p.lng <= -74.05)

// Reads older saves where rangeMiles 99 meant "including NYC"
export const rangeOf = (a: { rangeMiles: number; includeNyc?: boolean }) =>
  a.rangeMiles >= 99 ? { miles: 25, nyc: true } : { miles: a.rangeMiles, nyc: !!a.includeNyc }

// Miles between two coordinates
export const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}
