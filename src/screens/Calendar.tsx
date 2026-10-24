import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { eventsOn } from '../lib/derive'
import { DAY_LETTERS, addDays, formatDay, formatLongDay, fromISO, todayISO, weekStart } from '../lib/dates'
import { WORKS, type CalEvent, type EventKind, type Work } from '../lib/types'
import { Fab, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'

const ORDER: Work[] = ['tzofim', 'yj', 'personal']

export function Calendar() {
  const { events, setEvents } = useStore()
  const today = todayISO()
  const [visible, setVisible] = useState<Record<Work, boolean>>({ tzofim: true, yj: true, personal: true })
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const start = weekStart(day)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const dayEvents = eventsOn(events, day, visible)
  const vacations = events.filter((e) => e.kind === 'vacation' && (e.endDate ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <main className="screen">
      <div className="between">
        <h1>יומן</h1>
        <span className="chip small" title="סנכרון עם Google Calendar יתווסף בשלב הבא">
          <Icon name="sync" size={14} stroke={2.5} /> Google — בקרוב
        </span>
      </div>

      <div className="chips">
        {ORDER.map((w) => (
          <button key={w} className={`chip ${visible[w] ? '' : 'off'}`} aria-pressed={visible[w]}
            style={visible[w] ? { borderColor: `var(--${w}-dot)`, borderWidth: 1.5, fontWeight: 700 } : undefined}
            onClick={() => setVisible((v) => ({ ...v, [w]: !v[w] }))}>
            <span className={`dot d-${w}`} style={visible[w] ? undefined : { background: '#C3CAD6' }} />
            {WORKS[w].label}
          </button>
        ))}
      </div>

      <div className="between">
        <button className="icon-btn" aria-label="שבוע קודם" onClick={() => setDay(addDays(day, -7))}><Icon name="chevronR" /></button>
        <button className="chip" style={{ border: 'none', background: 'none', fontWeight: 700, fontSize: 16 }} onClick={() => setDay(today)}>
          {formatDay(days[0])} – {formatDay(days[6])}
        </button>
        <button className="icon-btn" aria-label="שבוע הבא" onClick={() => setDay(addDays(day, 7))}><Icon name="chevronL" /></button>
      </div>

      <div className="week">
        {days.map((d, i) => {
          const on = eventsOn(events, d, visible)
          return (
            <button key={d} className={`${d === day ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDay(d)}
              aria-label={formatLongDay(d)} aria-pressed={d === day}>
              <span className="small">{DAY_LETTERS[i]}</span>
              <span className="num">{fromISO(d).getDate()}</span>
              <span className="dots">
                {ORDER.filter((w) => on.some((e) => e.work === w)).map((w) => <span key={w} className={`d-${w}`} />)}
              </span>
            </button>
          )
        })}
      </div>

      <section className="col" style={{ gap: 8 }}>
        <span className="bold">{formatLongDay(day)}{day === today ? ' · היום' : ''}</span>
        {dayEvents.length === 0 && <p className="empty">אין אירועים ביום הזה{Object.values(visible).includes(false) ? ' עם הסינון הנוכחי' : ''}</p>}
        {dayEvents.map((e) => (
          <button key={e.id} className={`event w-${e.work} ${e.kind === 'deadline' ? 'deadline' : ''}`} style={{ border: e.kind === 'deadline' ? undefined : 'none', textAlign: 'start' }}
            onClick={() => setEditing(e)}>
            <span className="time ltr">{e.kind === 'vacation' ? '—' : e.start ?? 'כל היום'}</span>
            <span className="col" style={{ gap: 2, flex: 1 }}>
              <span className="title">{e.title}</span>
              <span className="small bold">{WORKS[e.work].label}{e.kind === 'deadline' ? ' · דדליין' : e.kind === 'vacation' ? ' · חופשה' : ''}</span>
            </span>
          </button>
        ))}
      </section>

      {vacations.length > 0 && (
        <section className="col" style={{ gap: 8 }}>
          <h2>חופשות קרובות</h2>
          {vacations.map((v) => (
            <button key={v.id} className="card row" style={{ flexDirection: 'row', borderStyle: 'dashed', textAlign: 'start' }} onClick={() => setEditing(v)}>
              <Icon name="sun" size={18} /> <span>{v.title}: {formatDay(v.date)}{v.endDate && v.endDate !== v.date ? ` – ${formatDay(v.endDate)}` : ''}</span>
            </button>
          ))}
        </section>
      )}

      <Fab label="אירוע" onClick={() => setEditing({ id: '', title: '', work: 'tzofim', kind: 'event', date: day })} />

      {editing && <EventSheet event={editing} onClose={() => setEditing(null)}
        onSave={(e) => setEvents((es) => (editing.id ? es.map((x) => (x.id === e.id ? e : x)) : [...es, e]))}
        onDelete={() => setEvents((es) => es.filter((x) => x.id !== editing.id))} />}
    </main>
  )
}

function EventSheet({ event, onClose, onSave, onDelete }: { event: CalEvent; onClose: () => void; onSave: (e: CalEvent) => void; onDelete: () => void }) {
  const [kind, setKind] = useState<EventKind>(event.kind)
  return (
    <Sheet title={event.id ? 'עריכת אירוע' : 'אירוע חדש'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        const s = (k: string) => String(f.get(k) || '') || undefined
        onSave({
          id: event.id || newId(), title: String(f.get('title')), work: f.get('work') as Work, kind,
          date: String(f.get('date')),
          endDate: kind === 'vacation' ? s('endDate') : undefined,
          start: kind === 'vacation' ? undefined : s('start'),
          end: kind === 'event' ? s('end') : undefined,
        })
        onClose()
      }}>
        <div className="chips" role="radiogroup" aria-label="סוג">
          {([['event', 'אירוע'], ['deadline', 'דדליין'], ['vacation', 'חופשה']] as const).map(([k, l]) => (
            <button type="button" key={k} role="radio" aria-checked={kind === k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <label className="field">כותרת<input name="title" defaultValue={event.title} required autoFocus={!event.id} /></label>
        <label className="field">שייך ל
          <select name="work" defaultValue={event.work}>{ORDER.map((w) => <option key={w} value={w}>{WORKS[w].label}</option>)}</select>
        </label>
        <div className="grid2">
          <label className="field">{kind === 'vacation' ? 'מתאריך' : 'תאריך'}<input name="date" type="date" defaultValue={event.date} required /></label>
          {kind === 'vacation'
            ? <label className="field">עד תאריך<input name="endDate" type="date" defaultValue={event.endDate ?? event.date} /></label>
            : <label className="field">{kind === 'deadline' ? 'עד שעה' : 'משעה'}<input name="start" type="time" defaultValue={event.start} /></label>}
        </div>
        {kind === 'event' && <label className="field">עד שעה<input name="end" type="time" defaultValue={event.end} /></label>}
        <button className="btn block" type="submit">שמור</button>
        {event.id && <button type="button" className="btn danger block" onClick={() => { onDelete(); onClose() }}>מחק</button>}
      </form>
    </Sheet>
  )
}
