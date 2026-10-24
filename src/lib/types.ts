export type Work = 'tzofim' | 'yj' | 'personal'

export const WORKS: Record<Work, { label: string }> = {
  tzofim: { label: 'צופים' },
  yj: { label: 'Young Judaea' },
  personal: { label: 'אישי' },
}

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'

export const STATUSES: Record<TaskStatus, string> = {
  todo: 'לביצוע',
  doing: 'בתהליך',
  blocked: 'חסום',
  done: 'הושלם',
}

export interface Task {
  id: string
  title: string
  work: Work
  status: TaskStatus
  due?: string // yyyy-mm-dd
  note?: string
}

export type EventKind = 'event' | 'deadline' | 'vacation'

export interface CalEvent {
  id: string
  title: string
  work: Work
  kind: EventKind
  date: string // yyyy-mm-dd
  endDate?: string // vacations span days
  start?: string // HH:mm
  end?: string
}

export interface Category {
  id: string
  name: string
  plan: number
}

export interface Expense {
  id: string
  amount: number
  categoryId: string
  note: string
  date: string
}

export interface Person {
  id: string
  name: string
  everyDays: number
  lastTalk: string // yyyy-mm-dd
}

export interface Settings {
  name: string
  monthlyBudget: number
  reminderTime: string // HH:mm, local time
}

// Written daily by the scheduled agents into public/feeds/*.json
export interface FeedItem {
  id: string
  title: string
  summary?: string
  category: string
  when?: string
  date?: string // yyyy-mm-dd, used for "add to calendar"
  where?: string
  price?: string
  url?: string
  idea?: string
}

export interface Feed {
  updatedAt: string | null
  items: FeedItem[]
}
