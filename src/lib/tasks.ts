// The task model: write it down, sort it later, choose up to three for today.
import type { Task } from './types'

export const TODAY_MAX = 3

const open = (t: Task) => t.status !== 'done'

export const todayTasks = (tasks: Task[], today: string) =>
  tasks.filter((t) => open(t) && t.plannedFor === today).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

export const inboxTasks = (tasks: Task[]) => tasks.filter((t) => open(t) && t.inbox)

// Everything else that is still open: dated first (soonest first), then undated
export const laterTasks = (tasks: Task[], today: string) =>
  tasks
    .filter((t) => open(t) && !t.inbox && t.plannedFor !== today)
    .sort((a, b) => (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99'))

export const doneOn = (tasks: Task[], day: string) => tasks.filter((t) => t.status === 'done' && t.doneAt === day)

// Puts a task into today's list, at the end. Returns null when today is already full.
export function planForToday(tasks: Task[], id: string, today: string): Task[] | null {
  const chosen = todayTasks(tasks, today)
  if (chosen.some((t) => t.id === id)) return tasks
  if (chosen.length >= TODAY_MAX) return null
  const order = chosen.length ? Math.max(...chosen.map((t) => t.order ?? 0)) + 1 : 0
  return tasks.map((t) => (t.id === id ? { ...t, inbox: false, plannedFor: today, order } : t))
}

export const unplan = (tasks: Task[], id: string) =>
  tasks.map((t) => (t.id === id ? { ...t, plannedFor: undefined, order: undefined } : t))

export function makeFirst(tasks: Task[], id: string, today: string) {
  const chosen = todayTasks(tasks, today)
  const ids = [id, ...chosen.map((t) => t.id).filter((x) => x !== id)]
  return tasks.map((t) => (ids.includes(t.id) ? { ...t, order: ids.indexOf(t.id) } : t))
}

export const complete = (tasks: Task[], id: string, today: string) =>
  tasks.map((t) => (t.id === id ? { ...t, status: 'done' as const, doneAt: today, inbox: false } : t))

export const reopen = (tasks: Task[], id: string) =>
  tasks.map((t) => (t.id === id ? { ...t, status: 'todo' as const, doneAt: undefined } : t))

// Once, when the new model first opens: tasks that were "in progress" on the old board become today's
// (up to three, soonest due first). Nothing else changes and no field is removed.
export function adoptBoard(tasks: Task[], today: string): Task[] {
  const doing = tasks
    .filter((t) => t.status === 'doing' && !t.plannedFor)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, TODAY_MAX)
    .map((t) => t.id)
  return tasks.map((t) => (doing.includes(t.id) ? { ...t, plannedFor: today, order: doing.indexOf(t.id) } : t))
}
