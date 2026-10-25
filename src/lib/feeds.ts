import { useEffect, useState } from 'react'
import type { Feed } from './types'
import { sanitizeFeed } from './feedSchema'

export function useFeed(name: 'deals' | 'shlichut') {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}feeds/${name}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      // The feed is checked in CI too; checking again here keeps a bad file from ever reaching the screen
      .then((raw: unknown) => {
        const { feed: f, fatal } = sanitizeFeed(raw, name)
        if (!alive) return
        if (fatal) setError(true)
        else setFeed(f)
      })
      .catch(() => alive && setError(true))
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
