import { useState } from 'react'
import { roundCoord, searchPlaces } from '../lib/places'
import type { Place } from '../lib/types'

// Type a town, pick it from the results (or use the phone's location, rounded to ~1 km)
export function PlacePicker({ value, onPick, label }: { value: Place; onPick: (p: Place) => void; label: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [msg, setMsg] = useState('')

  const search = async () => {
    if (!query.trim()) return
    setMsg('')
    try {
      const r = await searchPlaces(query.trim())
      setResults(r)
      if (!r.length) setMsg('לא מצאתי. נסו באנגלית, למשל "Fair Lawn".')
    } catch {
      setMsg('החיפוש נכשל. בדקו את החיבור.')
    }
  }

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => onPick({ name: 'המיקום שלי', lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) }),
    () => setMsg('לא קיבלתי הרשאת מיקום.'),
  )

  return (
    <div className="field">
      {label}
      <span className="bold" style={{ fontSize: 15 }}>{value.name}</span>
      <div className="row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש עיר, למשל Fair Lawn" style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
        <button type="button" className="chip small" onClick={search}>חיפוש</button>
        <button type="button" className="chip small" onClick={locate}>המיקום שלי</button>
      </div>
      {results?.map((p) => (
        <button type="button" key={`${p.lat},${p.lng}`} className="chip small" style={{ alignSelf: 'flex-start' }}
          onClick={() => { onPick(p); setResults(null); setQuery('') }}>{p.name}</button>
      ))}
      {msg && <span className="small" style={{ color: 'var(--danger)' }}>{msg}</span>}
    </div>
  )
}
