// Calendar / task categories. The first three are built in; the user can add more.
export type Work = string

export interface CalCategory {
  id: Work
  label: string
  color: string // palette key, see COLORS
  googleCalendarId?: string // when set, events of this category live in that Google calendar
}

export const COLORS: Record<string, { dot: string; bg: string; fg: string; name: string }> = {
  blue: { dot: '#1D4ED8', bg: '#DBE6FD', fg: '#1E3A8A', name: 'כחול' },
  orange: { dot: '#EA8A2E', bg: '#FDE7CF', fg: '#7C2D12', name: 'כתום' },
  green: { dot: '#2F9E68', bg: '#D7F2E3', fg: '#14532D', name: 'ירוק' },
  purple: { dot: '#7C3AED', bg: '#EDE4FB', fg: '#4C1D95', name: 'סגול' },
  pink: { dot: '#DB2777', bg: '#FCE3EF', fg: '#831843', name: 'ורוד' },
  teal: { dot: '#0D9488', bg: '#D5F3EF', fg: '#134E4A', name: 'טורקיז' },
  yellow: { dot: '#CA8A04', bg: '#FBF0C9', fg: '#713F12', name: 'צהוב' },
  gray: { dot: '#475569', bg: '#E5E9F0', fg: '#1E293B', name: 'אפור' },
}

export const DEFAULT_CATEGORIES: CalCategory[] = [
  { id: 'tzofim', label: 'צופים', color: 'blue' },
  { id: 'yj', label: 'Young Judaea', color: 'orange' },
  { id: 'personal', label: 'אישי', color: 'green' },
]

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
  googleId?: string
  googleCalendarId?: string
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
  refund?: boolean // money that came back; reduces net spending
}

export interface Owed {
  id: string
  who: string
  what: string
  amount: number
  categoryId: string
  date: string
}

// g = talked on time, y = a bit late, r = very late
export type TouchGrade = 'g' | 'y' | 'r'

export interface Person {
  id: string
  name: string
  everyDays: number
  lastTalk: string // yyyy-mm-dd
  phone?: string
  photo?: string // small data URL
  history?: TouchGrade[] // oldest first, last 8
}

export interface Settings {
  name: string
  monthlyBudget: number
  reminderTime: string // HH:mm, local time
  googleClientId?: string
  githubToken?: string // optional, lets the app save agent settings to the repo
}

// Read by the daily deals agent from public/agent-settings.json
export interface AgentSettings {
  home: string // town / address the agent measures distance from
  lat: number
  lng: number
  rangeMiles: number // older saves may hold 99, which meant "anywhere, including NYC"
  includeNyc?: boolean // also look in New York City, whatever its distance
  maxPrice: number // 0 = free only, 999 = any
  topics: string[]
  extra: string
  updatedAt?: string // when it was last saved from the app
}

export const DEAL_TOPICS: { id: string; label: string }[] = [
  { id: 'food', label: 'אוכל וארוחות' },
  { id: 'out', label: 'יציאות ומוזיקה' },
  { id: 'sale', label: 'מבצעים' },
  { id: 'culture', label: 'מוזיאונים ותרבות' },
  { id: 'sport', label: 'ספורט וטבע' },
  { id: 'jewish', label: 'קהילה יהודית' },
]

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
  priceValue?: number // numeric price in USD, 0 = free
  lat?: number
  lng?: number
  url?: string
  idea?: string
}

export interface Feed {
  updatedAt: string | null
  items: FeedItem[]
}
