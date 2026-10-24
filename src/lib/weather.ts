import { useEffect, useState } from 'react'

// Open-Meteo: free forecast API, no key needed
export interface Weather {
  temp: number
  max: number
  min: number
  rainChance: number
  code: number
}

export type Sky = 'sun' | 'cloud' | 'rain' | 'snow'
export type Wear = 'shirt' | 'jacket' | 'coat' | 'umbrella'

const CACHE = 'shaliach:weather'

export function useWeather(lat: number, lng: number) {
  const [w, setW] = useState<Weather | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null') as { at: number; w: Weather } | null
      return c && Date.now() - c.at < 3 * 3600_000 ? c.w : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (w) return
    const q = new URLSearchParams({
      latitude: String(lat), longitude: String(lng), timezone: 'auto', forecast_days: '1',
      current: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    })
    fetch('https://api.open-meteo.com/v1/forecast?' + q)
      .then((r) => r.json())
      .then((d) => {
        const next: Weather = {
          temp: d.current.temperature_2m, code: d.current.weather_code,
          max: d.daily.temperature_2m_max[0], min: d.daily.temperature_2m_min[0],
          rainChance: d.daily.precipitation_probability_max[0] ?? 0,
        }
        setW(next)
        try {
          localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), w: next }))
        } catch {
          // no cache, refetch next time
        }
      })
      .catch(() => {})
  }, [w, lat, lng])
  return w
}

// WMO weather codes
export const skyOf = (code: number): Sky =>
  code >= 71 && code <= 86 && !(code >= 80 && code <= 82) ? 'snow' : code >= 51 ? 'rain' : code >= 2 ? 'cloud' : 'sun'

export const SKY_TEXT: Record<Sky, string> = { sun: 'שמשי', cloud: 'מעונן', rain: 'גשום', snow: 'שלג' }

export function whatToWear(w: Weather): { wear: Wear; text: string } {
  const cold = w.max < 8
  const cool = w.max < 18
  if (skyOf(w.code) === 'snow') return { wear: 'coat', text: 'מעיל + כפפות' }
  if (w.rainChance >= 50) return { wear: 'umbrella', text: cold ? 'מטרייה + מעיל' : 'מטרייה + ז׳קט' }
  if (cold) return { wear: 'coat', text: 'מעיל חם' }
  if (cool) return { wear: 'jacket', text: 'ז׳קט קל' }
  return { wear: 'shirt', text: 'טי-שירט' }
}

export const toF = (c: number) => Math.round((c * 9) / 5 + 32)
