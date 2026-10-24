import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AgentSettings, CalCategory, CalEvent, Category, Expense, Owed, Person, Settings, Task } from './types'
import { DEFAULT_CATEGORIES } from './types'
import { addDays, todayISO } from './dates'

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

export const newId = () => Math.random().toString(36).slice(2, 10)

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
  home: 'New Jersey',
  lat: 40.7357,
  lng: -74.1724,
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
  const [events, setEvents] = usePersistent<CalEvent[]>('events', () => [])
  // Events mirrored from Google Calendar; replaced on every fetch
  const [googleEvents, setGoogleEvents] = usePersistent<CalEvent[]>('googleEvents', () => [])
  const [calCategories, setCalCategories] = usePersistent<CalCategory[]>('calCategories', () => DEFAULT_CATEGORIES)
  const [categories, setCategories] = usePersistent<Category[]>('categories', defaultCategories)
  const [expenses, setExpenses] = usePersistent<Expense[]>('expenses', () => [])
  const [owed, setOwed] = usePersistent<Owed[]>('owed', () => [])
  const [people, setPeople] = usePersistent<Person[]>('people', defaultPeople)
  const [savedDeals, setSavedDeals] = usePersistent<string[]>('savedDeals', () => [])
  const [agentSettings, setAgentSettings] = usePersistent<AgentSettings>('agentSettings', () => DEFAULT_AGENT_SETTINGS)

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
    savedDeals, setSavedDeals,
    agentSettings, setAgentSettings,
  }
}

type AppState = ReturnType<typeof useAppState>

const Ctx = createContext<AppState | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useAppState()}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

// All events the calendar shows: local ones plus those mirrored from Google
// eslint-disable-next-line react-refresh/only-export-components
export function useAllEvents() {
  const { events, googleEvents } = useStore()
  return [...events, ...googleEvents]
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategory() {
  const { calCategories } = useStore()
  return (id: string) => calCategories.find((c) => c.id === id) ?? { id, label: id, color: 'gray' }
}
