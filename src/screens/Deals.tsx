import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { updatedText, useFeed } from '../lib/feeds'
import { SelfTabs } from '../components/ui'
import { Icon } from '../components/Icon'
import type { FeedItem } from '../lib/types'

const FILTERS = ['הכל', 'חינם', 'אוכל', 'יציאות', 'מבצעים', 'שמורים']

export function Deals() {
  const { feed, error } = useFeed('deals')
  const { savedDeals, setSavedDeals, setEvents } = useStore()
  const [filter, setFilter] = useState('הכל')
  const [added, setAdded] = useState<string[]>([])

  const items = (feed?.items ?? []).filter((d) => {
    if (filter === 'הכל') return true
    if (filter === 'שמורים') return savedDeals.includes(d.id)
    if (filter === 'חינם') return d.price === 'חינם'
    return d.category === filter
  })

  const toggleSave = (id: string) =>
    setSavedDeals((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const addToCalendar = (d: FeedItem) => {
    if (!d.date) return
    setEvents((ev) => [...ev, { id: newId(), title: d.title, work: 'personal', kind: 'event', date: d.date! }])
    setAdded((a) => [...a, d.id])
  }

  return (
    <main className="screen">
      <h1>לעצמי</h1>
      <SelfTabs active="deals" />

      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <span className="avatar w-personal" style={{ width: 32, height: 32 }}><Icon name="search" size={18} /></span>
        <div className="col" style={{ gap: 0 }}>
          <span className="bold" style={{ fontSize: 14 }}>הסוכן סורק בשבילך כל בוקר</span>
          <span className="muted small">אירועים חינם, happy hours, מבצעים · {updatedText(feed?.updatedAt)}</span>
        </div>
      </div>

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${f === filter ? 'on' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {error && <p className="empty">לא הצלחתי לטעון את הגילויים. בדקו את החיבור לאינטרנט.</p>}
      {!error && feed && items.length === 0 && (
        <p className="empty">{feed.items.length === 0 ? 'עוד אין גילויים — הסוכן ימלא כאן ברגע שירוץ.' : 'אין גילויים בסינון הזה'}</p>
      )}

      {items.map((d) => (
        <article key={d.id} className="card">
          <div className="between">
            <span className="muted small">{[d.category, d.when].filter(Boolean).join(' · ')}</span>
            {d.price && <span className={`tag ${d.price === 'חינם' ? 'free' : 'paid'}`}>{d.price}</span>}
          </div>
          <span className="bold" style={{ fontSize: 16 }}>{d.title}</span>
          {d.summary && <span className="muted">{d.summary}</span>}
          {d.where && <span className="muted">{d.where}</span>}
          <div className="row">
            {d.date && (
              <button className="btn" style={{ flex: 1 }} disabled={added.includes(d.id)} onClick={() => addToCalendar(d)}>
                {added.includes(d.id) ? 'נוסף ליומן' : 'הוסף ליומן'}
              </button>
            )}
            {d.url && <a className="btn light row" style={{ textDecoration: 'none', flex: d.date ? undefined : 1, justifyContent: 'center' }} href={d.url} target="_blank" rel="noreferrer">לפרטים</a>}
            <button className={`icon-btn ${savedDeals.includes(d.id) ? 'solid' : ''}`} style={{ borderRadius: 10 }}
              aria-label={savedDeals.includes(d.id) ? 'הסר משמורים' : 'שמור'} aria-pressed={savedDeals.includes(d.id)}
              onClick={() => toggleSave(d.id)}>
              <Icon name="bookmark" size={18} />
            </button>
          </div>
        </article>
      ))}
    </main>
  )
}
