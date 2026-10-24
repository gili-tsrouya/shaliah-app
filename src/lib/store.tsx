import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CalEvent, Category, Expense, Person, Settings, Task } from './types'
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

function useAppState() {
  const [settings, setSettings] = usePersistent<Settings>('settings', () => ({
    name: 'גילי',
    monthlyBudget: 2000,
    reminderTime: '12:00',
  }))
  const [tasks, setTasks] = usePersistent<Task[]>('tasks', () => [])
  const [events, setEvents] = usePersistent<CalEvent[]>('events', () => [])
  const [categories, setCategories] = usePersistent<Category[]>('categories', defaultCategories)
  const [expenses, setExpenses] = usePersistent<Expense[]>('expenses', () => [])
  const [people, setPeople] = usePersistent<Person[]>('people', defaultPeople)
  const [savedDeals, setSavedDeals] = usePersistent<string[]>('savedDeals', () => [])

  return {
    settings, setSettings,
    tasks, setTasks,
    events, setEvents,
    categories, setCategories,
    expenses, setExpenses,
    people, setPeople,
    savedDeals, setSavedDeals,
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
