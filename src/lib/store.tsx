import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Activity, ActivityMethod, AgentSettings, ImportantContact, CalCategory, CalEvent, Category, DropSeen, Expense, Owed, Partnership, Person, Profile, Settings, Task } from './types'
import { DEFAULT_CATEGORIES } from './types'
import { addDays, todayISO } from './dates'
import { mirrorPeople } from './push'
import { callEvents as callOccurrences, syncCallEvents, type SyncedCall } from './calls'
import { createRawEvent, deleteEvent, serverToken, storedToken, updateRawEvent } from './google'
import { loadAgentSettings, loadShlichutSettings, saveAgentSettings, saveShlichutSettings } from './github'
import { adoptBoard } from './tasks'

const PREFIX = 'shaliach:'

function usePersistent<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // storage unavailable: fall back to defaults
    }
    return initial()
  })
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // ignore quota / private mode errors
    }
  }, [key, value])
  return [value, setValue] as const
}

import { newId } from './ids'
export { newId }

const defaultCategories = (): Category[] => [
  { id: 'food', name: 'אוכל וסופר', plan: 600 },
  { id: 'fun', name: 'יציאות ובילויים', plan: 250 },
  { id: 'home', name: 'קניות לבית', plan: 250 },
  { id: 'transport', name: 'תחבורה', plan: 200 },
  { id: 'phone', name: 'טלפון ומנויים', plan: 100 },
  { id: 'savings', name: 'חיסכון', plan: 300 },
]

const defaultPeople = (): Person[] => [
  { id: newId(), name: 'סבתא', everyDays: 7, lastTalk: addDays(todayISO(), -7) },
  { id: newId(), name: 'אמא ואבא', everyDays: 3, lastTalk: addDays(todayISO(), -3) },
]

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  home: 'Fair Lawn, NJ',
  lat: 40.9404,
  lng: -74.1318,
  rangeMiles: 10,
  maxPrice: 10,
  topics: ['food', 'out', 'sale', 'jewish'],
  extra: '',
}

function useAppState() {
  const [settings, setSettings] = usePersistent<Settings>('settings', () => ({
    name: 'גילי',
    monthlyBudget: 2000,
    reminderTime: '12:00',
  }))
  const [tasks, setTasks] = usePersistent<Task[]>('tasks', () => [])
  // The board's "in progress" tasks become today's three the first time the new task model runs
  const [tasksModel, setTasksModel] = usePersistent<number>('tasksModel', () => 0)
  useEffect(() => {
    if (tasksModel >= 1) return
    setTasks((ts) => adoptBoard(ts, todayISO()))
    setTasksModel(1)
  }, [tasksModel, setTasks, setTasksModel])
  const [events, setEvents] = usePersistent<CalEvent[]>('events', () => [])
  // Events mirrored from Google Calendar; replaced on every fetch
  const [googleEvents, setGoogleEvents] = usePersistent<CalEvent[]>('googleEvents', () => [])
  const [calCategories, setCalCategories] = usePersistent<CalCategory[]>('calCategories', () => DEFAULT_CATEGORIES)
  const [categories, setCategories] = usePersistent<Category[]>('categories', defaultCategories)
  const [expenses, setExpenses] = usePersistent<Expense[]>('expenses', () => [])
  const [owed, setOwed] = usePersistent<Owed[]>('owed', () => [])
  const [people, setPeople] = usePersistent<Person[]>('people', defaultPeople)
  const [importantContacts, setImportantContacts] = usePersistent<ImportantContact[]>('importantContacts', () => [])
  // The morning notification is put together by the service worker, which cannot read localStorage
  useEffect(() => mirrorPeople(people), [people])
  // Which Google Calendar event holds each person's repeating call
  const [callEvents, setCallEvents] = usePersistent<Record<string, SyncedCall>>('callEvents', () => ({}))
  const [savedDeals, setSavedDeals] = usePersistent<string[]>('savedDeals', () => [])
  const [agentSettings, setAgentSettings] = usePersistent<AgentSettings>('agentSettings', () => DEFAULT_AGENT_SETTINGS)
  // The daily deck: shlichut ideas kept for later, and which items were already gone through
  const [savedIdeas, setSavedIdeas] = usePersistent<string[]>('savedIdeas', () => [])
  // Activities she prepares, and methods she saved to reuse
  const [activities, setActivities] = usePersistent<Activity[]>('activities', () => [])
  const [methodBank, setMethodBank] = usePersistent<(ActivityMethod & { id: string })[]>('methodBank', () => [])
  const [dropSeen, setDropSeen] = usePersistent<Record<string, DropSeen>>('dropSeen', () => ({}))

  const [profile, setProfile] = usePersistent<Profile>('profile', () => ({
    home: { name: DEFAULT_AGENT_SETTINGS.home, lat: DEFAULT_AGENT_SETTINGS.lat, lng: DEFAULT_AGENT_SETTINGS.lng },
    interests: [],
    interestsExtra: '',
  }))
  const [partnerships, setPartnerships] = usePersistent<Partnership[]>('partnerships', () => [])
  const [partnershipsUpdatedAt, setPartnershipsUpdatedAt] = usePersistent<string>('partnershipsUpdatedAt', () => '')

  // The repo copy is what the agents use, so it wins over the phone's copy unless the phone saved something newer
  useEffect(() => {
    loadAgentSettings().then((s) => s && setAgentSettings((cur) => ((s.updatedAt ?? '') >= (cur.updatedAt ?? '') ? { ...cur, ...s } : cur)))
    loadShlichutSettings().then((s) => {
      if (!s || s.updatedAt < partnershipsUpdatedAt) return
      setPartnerships(s.partnerships)
      setPartnershipsUpdatedAt(s.updatedAt)
    })
    // Once at start-up, comparing with what the phone had then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save on the phone and, when a GitHub token is set, in the repo so the agent uses it on its next run.
  // Returns false when it stayed on the phone only.
  const publishAgentSettings = useCallback(async (next: AgentSettings) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() }
    setAgentSettings(stamped)
    if (!settings.githubToken) return false
    await saveAgentSettings(settings.githubToken, stamped)
    return true
  }, [setAgentSettings, settings.githubToken])

  // What the deck learned about shlichut ideas; travels with the partnerships file the agent reads
  const [shlichutTaste, setShlichutTaste] = usePersistent<{ more: string[]; less: string[] }>('shlichutTaste', () => ({ more: [], less: [] }))

  const publishPartnerships = useCallback(async (next: Partnership[]) => {
    const updatedAt = new Date().toISOString()
    setPartnerships(next)
    setPartnershipsUpdatedAt(updatedAt)
    if (!settings.githubToken) return false
    await saveShlichutSettings(settings.githubToken, { updatedAt, partnerships: next, taste: shlichutTaste })
    return true
  }, [setPartnerships, setPartnershipsUpdatedAt, settings.githubToken, shlichutTaste])

  const publishShlichutTaste = useCallback(async (taste: { more: string[]; less: string[] }) => {
    setShlichutTaste(taste)
    if (!settings.githubToken) return false
    // the partnerships did not change, so their own timestamp stays as it is
    await saveShlichutSettings(settings.githubToken, { updatedAt: partnershipsUpdatedAt || new Date().toISOString(), partnerships, taste })
    return true
  }, [setShlichutTaste, settings.githubToken, partnershipsUpdatedAt, partnerships])

  // Brings Google Calendar in line with the fixed call days (needs a valid Google token).
  // Calls go to the Google calendar linked to the personal category; without one they stay in the app.
  const syncCalls = useCallback(async (token: string) => {
    const calendarId = calCategories.find((c) => c.id === 'personal')?.googleCalendarId
    if (!calendarId) return
    const next = await syncCallEvents(people, callEvents, calendarId, {
      create: (cal, body) => createRawEvent(token, cal, body),
      update: (cal, id, body) => updateRawEvent(token, cal, id, body),
      remove: (cal, id) => deleteEvent(token, cal, id),
    })
    if (JSON.stringify(next) !== JSON.stringify(callEvents)) setCallEvents(next)
  }, [people, callEvents, calCategories, setCallEvents])

  // Whenever the list changes and Google is connected, update the calendar too
  useEffect(() => {
    const token = storedToken()
    // without a valid token, a lasting connection through the account can supply one silently
    const t = setTimeout(() => {
      const ready = token ? Promise.resolve<string | null>(token) : serverToken()
      ready.then((tok) => (tok ? syncCalls(tok) : undefined)).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [syncCalls])

  return {
    settings, setSettings,
    tasks, setTasks,
    events, setEvents,
    googleEvents, setGoogleEvents,
    calCategories, setCalCategories,
    categories, setCategories,
    expenses, setExpenses,
    owed, setOwed,
    people, setPeople,
    importantContacts, setImportantContacts,
    callEvents, syncCalls,
    savedDeals, setSavedDeals,
    savedIdeas, setSavedIdeas,
    activities, setActivities,
    methodBank, setMethodBank,
    dropSeen, setDropSeen,
    agentSettings, setAgentSettings, publishAgentSettings,
    profile, setProfile,
    partnerships, publishPartnerships,
    shlichutTaste, publishShlichutTaste,
  }
}

type AppState = ReturnType<typeof useAppState>

const Ctx = createContext<AppState | null>(null)

// The latest store, for the rare case a screen renders without the context (seen once on an iPhone)
let lastState: AppState | null = null

export function StoreProvider({ children }: { children: ReactNode }) {
  const state = useAppState()
  lastState = state
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx) ?? lastState
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

// All events the calendar shows: local ones plus those mirrored from Google
// eslint-disable-next-line react-refresh/only-export-components
export function useAllEvents() {
  const { events, googleEvents, people, callEvents } = useStore()
  // Fixed call days that are not in Google Calendar (yet) show as repeating calls here
  const today = todayISO()
  const calls = callOccurrences(people, callEvents, addDays(today, -60), addDays(today, 180))
  return [...events, ...googleEvents, ...calls]
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategory() {
  const { calCategories } = useStore()
  return (id: string) => calCategories.find((c) => c.id === id) ?? { id, label: id, color: 'gray' }
}
