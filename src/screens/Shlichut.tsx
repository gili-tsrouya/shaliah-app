import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { updatedText, useFeed } from '../lib/feeds'
import { Icon } from '../components/Icon'
import type { FeedItem } from '../lib/types'

const FILTERS = ['הכל', 'פרשת השבוע', 'חגים ומועדים', 'ישראל', 'העולם היהודי']

export function Shlichut() {
  const { feed, error } = useFeed('shlichut')
  const { setTasks } = useStore()
  const [filter, setFilter] = useState('הכל')
  const [made, setMade] = useState<string[]>([])

  const all = feed?.items ?? []
  const featured = all.find((i) => i.category === 'פרשת השבוע')
  const items = all.filter((i) => i !== featured && (filter === 'הכל' || i.category === filter))

  const makeTask = (i: FeedItem) => {
    setTasks((ts) => [...ts, { id: newId(), title: `הכנת פעילות: ${i.title}`, work: 'tzofim', status: 'todo', note: i.idea }])
    setMade((m) => [...m, i.id])
  }

  return (
    <main className="screen">
      <header className="col" style={{ gap: 4 }}>
        <h1>שליחות</h1>
        <p className="muted">מה שווה לדבר עליו השבוע עם הנוער · {updatedText(feed?.updatedAt)}</p>
      </header>

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${f === filter ? 'on' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {error && <p className="empty">לא הצלחתי לטעון את התוכן. בדקו את החיבור לאינטרנט.</p>}
      {!error && feed && all.length === 0 && <p className="empty">עוד אין תוכן — הסוכן ימלא כאן ברגע שירוץ.</p>}

      {featured && (filter === 'הכל' || filter === 'פרשת השבוע') && (
        <article className="card blue" style={{ gap: 10 }}>
          <span className="small bold" style={{ color: '#DBE6FD' }}>{featured.category}{featured.when ? ` · ${featured.when}` : ''}</span>
          <h2 style={{ fontSize: 21, lineHeight: 1.3 }}>{featured.title}</h2>
          {featured.idea && <p style={{ fontSize: 14, lineHeight: 1.5, color: '#EEF3FE' }}>{featured.idea}</p>}
          <button className="btn white" disabled={made.includes(featured.id)} onClick={() => makeTask(featured)}>
            {made.includes(featured.id) ? 'נוספה משימה' : 'צור משימה להכנת פעילות'}
          </button>
        </article>
      )}

      {items.map((i) => (
        <article key={i.id} className="card">
          <span className="muted small">{[i.category, i.when].filter(Boolean).join(' · ')}</span>
          <span className="bold" style={{ fontSize: 15 }}>{i.title}</span>
          {i.summary && <span style={{ fontSize: 14, color: '#3D4757', lineHeight: 1.45 }}>{i.summary}</span>}
          {i.idea && <span style={{ fontSize: 14, lineHeight: 1.45 }}><b>רעיון לשיחה: </b>{i.idea}</span>}
          <div className="row">
            <button className="btn light" style={{ flex: 1 }} disabled={made.includes(i.id)} onClick={() => makeTask(i)}>
              {made.includes(i.id) ? 'נוספה משימה' : 'צור משימה'}
            </button>
            {i.url && <a className="icon-btn" style={{ borderRadius: 10 }} href={i.url} target="_blank" rel="noreferrer" aria-label="למקור"><Icon name="link" size={18} /></a>}
          </div>
        </article>
      ))}
    </main>
  )
}
