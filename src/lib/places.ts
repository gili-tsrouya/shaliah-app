import type { AgentSettings, Place } from './types'
import { todayISO } from './dates'

// Open-Meteo geocoding: free, no key. Coordinates are rounded to ~1 km because they end up in a public file.
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + q)
  const d = (await r.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[] }
  return (d.results ?? []).map((p) => ({
    name: [p.name, p.country_code === 'US' ? p.admin1 : p.country_code].filter(Boolean).join(', '),
    lat: roundCoord(p.latitude),
    lng: roundCoord(p.longitude),
  }))
}

export const roundCoord = (n: number) => Math.round(n * 100) / 100

export const isAway = (a: AgentSettings, today = todayISO()) => !!a.awayUntil && today <= a.awayUntil

// Where the app and the agent should look right now: the temporary place while away, otherwise home
export const currentPlace = (a: AgentSettings): Place =>
  a.awayUntil && !isAway(a) && a.homeBase ? a.homeBase : { name: a.home, lat: a.lat, lng: a.lng }
