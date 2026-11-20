// Calendar / task categories. The first three are built in; the user can add more.
export type Work = string

export interface CalCategory {
  id: Work
  label: string
  color: string // palette key, see COLORS
  googleCalendarId?: string // when set, events of this category live in that Google calendar
}

export const COLORS: Record<string, { dot: string; bg: string; fg: string; name: string }> = {
  blue: { dot: '#2F6BE0', bg: '#E6EEFC', fg: '#1B4FB8', name: 'כחול' },
  orange: { dot: '#E8772E', bg: '#FCEBDD', fg: '#9A4512', name: 'כתום' },
  green: { dot: '#2E9A5E', bg: '#E1F3E8', fg: '#1C6B40', name: 'ירוק' },
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
  // "Write it down, then choose three" (since Nov 2026). All optional; `status` keeps its meaning.
  inbox?: boolean // written down quickly, not sorted yet
  plannedFor?: string // yyyy-mm-dd: one of the (up to three) tasks chosen for that day
  order?: number // position among that day's tasks; the first one is "קודם כל זה"
  doneAt?: string // yyyy-mm-dd when it was marked done
  blockEventId?: string // a calendar event she reserved for doing it
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
  // People invited by email. Only for events in a category linked to Google: Google sends the invitations.
  guests?: Guest[]
  meet?: boolean // ask Google for a Google Meet link when saving
  meetLink?: string // the Meet link Google created
  invitedBy?: string // set when someone else organized the event: its guest list is theirs and read-only here
  myStatus?: Guest['status'] // her own reply, on an event someone else invited her to
}

export interface Guest {
  email: string
  status?: 'needsAction' | 'accepted' | 'declined' | 'tentative'
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
  callDays?: number[] // fixed call days, 0 = Sunday … 6 = Saturday (e.g. Grandma on Fridays)
  callTime?: string // HH:mm, for the calendar event on those days
  talks?: string[] // yyyy-mm-dd of each day with a logged call, oldest first (from Nov 2026 on, see lib/talks.ts)
}

export interface Settings {
  name: string
  monthlyBudget: number
  reminderTime: string // HH:mm, local time
  googleClientId?: string
  githubToken?: string // optional, lets the app save agent settings to the repo
  dataRepoToken?: string // optional, token for the private data repo (morning reminder); never in backups
  pushEnabled?: boolean // morning "who to call" notification is on
  theme?: string // id from THEMES in lib/theme.ts; black when not set
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
  // Learned from the daily deck: find categories she tends to keep, and ones she tends to skip
  taste?: { more: string[]; less: string[] }
  // From the profile page. home/lat/lng above stay "where to search now"; homeBase is where Gili lives.
  age?: number
  interests?: string[]
  homeBase?: Place
  awayUntil?: string // yyyy-mm-dd: home/lat/lng is a temporary place (vacation) until this day, then homeBase again
}

export interface Place { name: string; lat: number; lng: number }

export interface Profile {
  age?: number
  home: Place
  savingGoal?: number // USD per month to put aside
  shlichutStart?: string // yyyy-mm-dd, the first day of the shlichut
  shlichutEnd?: string // yyyy-mm-dd, the planned last day; two years after the start when not set
  interests: string[]
  interestsExtra: string
}

export const INTERESTS = [
  'מוזיקה חיה', 'מסיבות וברים', 'אוכל ומסעדות', 'ספורט וכושר', 'יוגה', 'ריצה', 'טבע וטיולים', 'אמנות ומוזיאונים',
  'תיאטרון וקומדיה', 'קולנוע', 'ריקוד', 'קהילה יהודית', 'מפגשי ישראלים', 'התנדבות', 'צילום', 'קריאה וספרים',
  'משחקי קופסה', 'הרצאות וסדנאות',
]

// Shlichut: the communities Gili works with, read by the shlichut agent from public/shlichut-settings.json
export interface Partnership {
  id: string
  name: string
  community: string[]
  ageFrom: number
  ageTo: number
  notes?: string
}

export const COMMUNITIES = ['ישראלית', 'רפורמית', 'קונסרבטיבית', 'אורתודוקסית', 'מודרן אורתודוקסית', 'פלורליסטית / קהילתית', 'חילונית']

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
  // Shlichut: which partnerships this fits, with an idea tailored to each
  forPartnerships?: { id: string; idea?: string }[]
  // Shlichut: the idea already broken into methods, ready to become an activity
  plan?: ActivityPlan
}

// One method (מתודה) of an activity. `family` is one of METHOD_FAMILIES in lib/methods.ts.
export interface ActivityMethod {
  family: string
  name: string
  purpose: string
  minutes: number
  equipment: string[]
  content: string
}

export interface ActivityPlan {
  goal: string
  methods: ActivityMethod[]
}

export interface Feed {
  updatedAt: string | null
  items: FeedItem[]
}

// What Gili did with an item in the daily deck, and what the item looked like then.
// When the agent later changes the time, place or price, the item comes back marked as updated.
export interface DropSeen {
  at: string // yyyy-mm-dd
  did: 'skip' | 'save' | 'act'
  mark: string
}

// An activity she prepares in advance, built from methods (מתודות). Kept on the phone under `activities`.
export interface Activity {
  id: string
  title: string
  goal: string
  work?: Work // calendar category it belongs to
  partnershipId?: string
  ageFrom?: number
  ageTo?: number
  date?: string // yyyy-mm-dd
  start?: string // HH:mm
  methods: (ActivityMethod & { id: string })[]
  status: 'draft' | 'ready' | 'done'
  fromIdeaId?: string // the shlichut feed item it was built from
  packed?: string[] // equipment already packed
  review?: { feel?: string; came?: number; worked?: string; change?: string } // before Nov 2026: one review per activity (read through runsOf)
  runs?: ActivityRun[] // each time she ran it, with its own review
  calendarEventId?: string
  createdAt: string
  updatedAt: string
}

// One time an activity was run. An activity is a reusable plan; it can be run many times, for different groups.
export interface ActivityRun {
  id: string
  date: string // yyyy-mm-dd
  partnershipId?: string
  feel?: string
  came?: number
  worked?: string
  change?: string
}
