import { useEffect, useState } from 'react'
import type { Feed } from './types'

// Each feed is fetched once per app start and shared by every screen (and the tab bar's count)
const loads = new Map<string, Promise<Feed>>()
const loaded = new Map<string, Feed>()

export function useFeed(name: 'deals' | 'shlichut') {
  const [feed, setFeed] = useState<Feed | null>(() => loaded.get(name) ?? null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    let load = loads.get(name)
    if (!load) {
      load = fetch(`${import.meta.env.BASE_URL}feeds/${name}.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((f: Feed) => {
          loaded.set(name, f)
          return f
        })
      // a failed load is tried again next time
      load.catch(() => loads.delete(name))
      loads.set(name, load)
    }
    load.then((f) => alive && setFeed(f)).catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [name])
  return { feed, error }
}

export const updatedText = (iso: string | null | undefined) => {
  if (!iso) return 'הסוכן עוד לא רץ'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return 'עודכן לפני פחות משעה'
  const hours = Math.round(mins / 60)
  if (hours < 24) return `עודכן לפני ${hours === 1 ? 'שעה' : hours + ' שעות'}`
  const days = Math.round(hours / 24)
  return `עודכן לפני ${days === 1 ? 'יום' : days + ' ימים'}`
}
