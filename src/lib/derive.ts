import type { CalEvent, Expense, Person, Work } from './types'
import { daysBetween, daysLeftInMonth, monthKey, todayISO } from './dates'

export function budgetSummary(expenses: Expense[], monthlyBudget: number, today = todayISO()) {
  const month = monthKey(today)
  const thisMonth = expenses.filter((e) => monthKey(e.date) === month)
  const spent = thisMonth.reduce((s, e) => s + e.amount, 0)
  const remaining = monthlyBudget - spent
  const daysLeft = daysLeftInMonth(today)
  return { thisMonth, spent, remaining, daysLeft, perDay: Math.max(0, remaining) / daysLeft }
}

// Positive = days until the next talk is due, 0 = today, negative = overdue
export const daysUntilDue = (p: Person, today = todayISO()) => p.everyDays - daysBetween(p.lastTalk, today)

export const sortByDue = (people: Person[]) => [...people].sort((a, b) => daysUntilDue(a) - daysUntilDue(b))

export const eventsOn = (events: CalEvent[], date: string, visible?: Record<Work, boolean>) =>
  events
    .filter((e) => (e.kind === 'vacation' ? e.date <= date && date <= (e.endDate ?? e.date) : e.date === date))
    .filter((e) => !visible || visible[e.work])
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

export const FREQUENCIES = [
  { days: 1, label: 'כל יום' },
  { days: 3, label: 'פעמיים בשבוע' },
  { days: 7, label: 'פעם בשבוע' },
  { days: 14, label: 'פעם בשבועיים' },
  { days: 30, label: 'פעם בחודש' },
]

export const freqLabel = (days: number) => FREQUENCIES.find((f) => f.days === days)?.label ?? `כל ${days} ימים`
