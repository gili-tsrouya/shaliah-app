import { useCallback, useEffect, useState } from 'react'
import { useAllEvents, useCategory, useStore, newId } from '../lib/store'
import { colorOf, eventsOn } from '../lib/derive'
import { DAY_LETTERS, addDays, formatDay, formatLongDay, fromISO, todayISO, weekStart } from '../lib/dates'
import { COLORS, type CalCategory, type CalEvent, type EventKind, type Work } from '../lib/types'
import * as G from '../lib/google'
import { Fab, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'

type SyncState = 'off' | 'idle' | 'syncing' | 'error'

export function Calendar() {
  const { setEvents, calCategories, setCalCategories, settings, setGoogleEvents } = useStore()
  const all = useAllEvents()
  const cat = useCategory()
  const today = todayISO()
  const [hidden, setHidden] = useState<Record<Work, boolean>>({})
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [editingCat, setEditingCat] = useState<CalCategory | null>(null)
  const [showSync, setShowSync] = useState(false)
  const [token, setToken] = useState<string | null>(G.storedToken)
  const [sync, setSync] = useState<SyncState>(settings.googleClientId ? 'idle' : 'off')
  const [error, setError] = useState('')
  const visible = Object.fromEntries(calCategories.map((c) => [c.id, !hidden[c.id]]))
  const start = weekStart(day)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const dayEvents = eventsOn(all, day, visible)
  const vacations = all.filter((e) => e.kind === 'vacation' && (e.endDate ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date))
  const linked = calCategories.filter((c) => c.googleCalendarId)

  const refresh = useCallback(async (tok: string) => {
    if (!linked.length) return
    setSync('syncing')
    try {
      const from = addDays(today < start ? today : start, -30)
      const to = addDays(addDays(start, 6) > today ? addDays(start, 6) : today, 120)
      const lists = await Promise.all(linked.map((c) => G.fetchEvents(tok, c.googleCalendarId!, c.id, from, to)))
      setGoogleEvents(lists.flat())
      setSync('idle')
      setError('')
    } catch (e) {
      if ((e as Error).message === 'expired') setToken(null)
      setSync('error')
      setError('הסנכרון נכשל. לחצו "סנכרן" כדי להתחבר מחדש.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked.map((c) => c.googleCalendarId + c.id).join(), start, today, setGoogleEvents])

  // Pull on open and when moving between weeks, if we still hold a valid token
  useEffect(() => {
    if (token) refresh(token)
  }, [token, refresh])

  const ensureToken = async () => {
    if (token) return token
    if (!settings.googleClientId) throw new Error('nocid')
    const t = await G.connect(settings.googleClientId)
    setToken(t)
    return t
  }

  const saveEvent = async (e: CalEvent, before: CalEvent | null) => {
    const target = cat(e.work).googleCalendarId
    const wasGoogle = before?.googleId && before.googleCalendarId
    try {
      if (target || wasGoogle) {
        const tok = await ensureToken()
        if (wasGoogle && before!.googleCalendarId === target) await G.updateEvent(tok, target!, before!.googleId!, e)
        else {
          if (wasGoogle) await G.deleteEvent(tok, before!.googleCalendarId!, before!.googleId!)
          if (target) await G.createEvent(tok, target, e)
        }
        if (before && !wasGoogle) setEvents((es) => es.filter((x) => x.id !== before.id))
        if (!target) setEvents((es) => [...es, { ...e, id: newId(), googleId: undefined, googleCalendarId: undefined }])
        await refresh(tok)
      } else {
        setEvents((es) => (before ? es.map((x) => (x.id === before.id ? e : x)) : [...es, e]))
      }
    } catch {
      setError('לא הצלחתי לשמור ב-Google Calendar. נסו לסנכרן מחדש.')
    }
  }

  const removeEvent = async (e: CalEvent) => {
    if (e.googleId && e.googleCalendarId) {
      try {
        const tok = await ensureToken()
        await G.deleteEvent(tok, e.googleCalendarId, e.googleId)
        setGoogleEvents((es) => es.filter((x) => x.id !== e.id))
      } catch {
        setError('לא הצלחתי למחוק ב-Google Calendar.')
      }
    } else setEvents((es) => es.filter((x) => x.id !== e.id))
  }

  const syncLabel = sync === 'off' ? 'Google — לא מחובר' : sync === 'syncing' ? 'מסנכרן…' : token && linked.length ? 'מסונכרן עם Google' : 'סנכרן עם Google'

  return (
    <main className="screen">
      <div className="between">
        <h1>יומן</h1>
        <button className="chip small" onClick={() => setShowSync(true)}
          style={token && sync === 'idle' && linked.length ? { background: 'var(--personal-bg)', color: 'var(--personal-fg)', borderColor: 'transparent' } : undefined}>
          <Icon name="sync" size={14} stroke={2.5} /> {syncLabel}
        </button>
      </div>
      {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="chips">
        {calCategories.map((c) => {
          const on = !hidden[c.id]
          const col = colorOf(c.color)
          return (
            <button key={c.id} className={`chip ${on ? '' : 'off'}`} aria-pressed={on}
              style={on ? { borderColor: col.dot, borderWidth: 1.5, fontWeight: 700 } : undefined}
              onClick={() => setHidden((h) => ({ ...h, [c.id]: on }))}
              onContextMenu={(ev) => { ev.preventDefault(); setEditingCat(c) }}>
              <span className="dot" style={{ background: on ? col.dot : '#C3CAD6' }} />
              {c.label}
            </button>
          )
        })}
        <button className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setEditingCat({ id: '', label: '', color: 'purple' })}>+ קטגוריה</button>
        <button className="chip" style={{ border: 'none', background: 'none', color: 'var(--muted)' }} onClick={() => setShowSync(true)}>עריכה</button>
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
          const on = eventsOn(all, d, visible)
          return (
            <button key={d} className={`${d === day ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDay(d)}
              aria-label={formatLongDay(d)} aria-pressed={d === day}>
              <span className="small">{DAY_LETTERS[i]}</span>
              <span className="num">{fromISO(d).getDate()}</span>
              <span className="dots">
                {calCategories.filter((c) => on.some((e) => e.work === c.id)).map((c) => <span key={c.id} style={{ background: colorOf(c.color).dot }} />)}
              </span>
            </button>
          )
        })}
      </div>

      <section className="col" style={{ gap: 8 }}>
        <span className="bold">{formatLongDay(day)}{day === today ? ' · היום' : ''}</span>
        {dayEvents.length === 0 && <p className="empty">אין אירועים ביום הזה{Object.values(hidden).includes(true) ? ' עם הסינון הנוכחי' : ''}</p>}
        {dayEvents.map((e) => {
          const col = colorOf(cat(e.work).color)
          return (
            <button key={e.id} className={`event ${e.kind === 'deadline' ? 'deadline' : ''}`}
              style={{ background: col.bg, color: col.fg, border: e.kind === 'deadline' ? undefined : 'none', textAlign: 'start' }}
              onClick={() => setEditing(e)}>
              <span className="time ltr">{e.kind === 'vacation' ? '—' : e.start ?? 'כל היום'}</span>
              <span className="col" style={{ gap: 2, flex: 1 }}>
                <span className="title">{e.title}</span>
                <span className="small bold">{cat(e.work).label}{e.kind === 'deadline' ? ' · דדליין' : e.kind === 'vacation' ? ' · חופשה' : ''}{e.googleId ? ' · Google' : ''}</span>
              </span>
            </button>
          )
        })}
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

      <Fab label="אירוע" onClick={() => setEditing({ id: '', title: '', work: calCategories[0]?.id ?? 'personal', kind: 'event', date: day })} />

      {editing && <EventSheet event={editing} categories={calCategories} onClose={() => setEditing(null)}
        onSave={(e) => saveEvent(e, editing.id ? editing : null)}
        onDelete={() => removeEvent(editing)} />}

      {editingCat && <CategorySheet category={editingCat} onClose={() => setEditingCat(null)}
        onSave={(c) => setCalCategories((cs) => (editingCat.id ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, { ...c, id: newId() }]))}
        onDelete={() => setCalCategories((cs) => cs.filter((x) => x.id !== editingCat.id))} />}

      {showSync && <SyncSheet token={token} onClose={() => setShowSync(false)}
        onConnected={(t) => { setToken(t); setSync('idle') }}
        onDisconnect={() => { G.disconnect(); setToken(null); setGoogleEvents([]) }}
        onEditCategory={(c) => { setShowSync(false); setEditingCat(c) }} />}
    </main>
  )
}

function EventSheet({ event, categories, onClose, onSave, onDelete }: {
  event: CalEvent; categories: CalCategory[]; onClose: () => void; onSave: (e: CalEvent) => void; onDelete: () => void
}) {
  const [kind, setKind] = useState<EventKind>(event.kind)
  return (
    <Sheet title={event.id ? 'עריכת אירוע' : 'אירוע חדש'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        const s = (k: string) => String(f.get(k) || '') || undefined
        onSave({
          ...event, id: event.id || newId(), title: String(f.get('title')), work: String(f.get('work')), kind,
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
          <select name="work" defaultValue={event.work}>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.googleCalendarId ? ' (Google)' : ''}</option>)}</select>
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

function CategorySheet({ category, onClose, onSave, onDelete }: {
  category: CalCategory; onClose: () => void; onSave: (c: CalCategory) => void; onDelete: () => void
}) {
  const [color, setColor] = useState(category.color)
  const builtIn = ['tzofim', 'yj', 'personal'].includes(category.id)
  return (
    <Sheet title={category.id ? 'עריכת קטגוריה' : 'קטגוריה חדשה'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        onSave({ ...category, label: String(new FormData(ev.currentTarget).get('label')), color })
        onClose()
      }}>
        <label className="field">שם (למשל: לימודים, התנדבות, ספורט)<input name="label" defaultValue={category.label} required autoFocus={!category.id} /></label>
        <div className="field">צבע
          <div className="row" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label="צבע">
            {Object.entries(COLORS).map(([k, c]) => (
              <button type="button" key={k} role="radio" aria-checked={color === k} aria-label={c.name} onClick={() => setColor(k)}
                style={{ width: 40, height: 40, borderRadius: 20, background: c.dot, border: color === k ? '3px solid var(--ink)' : '3px solid #fff', boxShadow: '0 0 0 1px var(--border)' }} />
            ))}
          </div>
        </div>
        <button className="btn block" type="submit">שמור</button>
        {category.id && !builtIn && <button type="button" className="btn danger block" onClick={() => { onDelete(); onClose() }}>מחק קטגוריה</button>}
      </form>
    </Sheet>
  )
}

function SyncSheet({ token, onClose, onConnected, onDisconnect, onEditCategory }: {
  token: string | null; onClose: () => void; onConnected: (t: string) => void; onDisconnect: () => void; onEditCategory: (c: CalCategory) => void
}) {
  const { settings, setSettings, calCategories, setCalCategories } = useStore()
  const [calendars, setCalendars] = useState<G.GoogleCalendar[] | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (token) G.listCalendars(token).then(setCalendars).catch(() => setMsg('לא הצלחתי לקרוא את רשימת היומנים.'))
  }, [token])

  const connect = async () => {
    if (!settings.googleClientId) return setMsg('קודם הדביקו את ה-Client ID.')
    try {
      onConnected(await G.connect(settings.googleClientId, 'consent'))
      setMsg('')
    } catch (e) {
      setMsg('החיבור נכשל: ' + (e as Error).message)
    }
  }

  return (
    <Sheet title="קטגוריות וסנכרון Google" onClose={onClose}>
      <label className="field">Google Client ID
        <input dir="ltr" defaultValue={settings.googleClientId} placeholder="xxxx.apps.googleusercontent.com"
          onBlur={(e) => setSettings((s) => ({ ...s, googleClientId: e.target.value.trim() || undefined }))} />
      </label>
      {!token
        ? <button className="btn block" onClick={connect}>התחבר ל-Google Calendar</button>
        : <button className="btn light block" onClick={onDisconnect}>התנתק מ-Google</button>}
      {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}

      <p className="muted small">לכל קטגוריה אפשר לבחור יומן Google. אירועים בקטגוריה הזו יישמרו שם ויגיעו משם — בשני הכיוונים.</p>
      {calCategories.map((c) => (
        <div key={c.id} className="row" style={{ gap: 10 }}>
          <button className="chip" style={{ minWidth: 120, justifyContent: 'flex-start' }} onClick={() => onEditCategory(c)}>
            <span className="dot" style={{ background: colorOf(c.color).dot }} />{c.label}
          </button>
          <select aria-label={`יומן Google עבור ${c.label}`} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', padding: '0 8px' }}
            value={c.googleCalendarId ?? ''} disabled={!calendars}
            onChange={(e) => setCalCategories((cs) => cs.map((x) => (x.id === c.id ? { ...x, googleCalendarId: e.target.value || undefined } : x)))}>
            <option value="">רק באפליקציה</option>
            {c.googleCalendarId && !calendars && <option value={c.googleCalendarId}>{c.googleCalendarId}</option>}
            {calendars?.map((g) => <option key={g.id} value={g.id}>{g.summary}{g.primary ? ' (ראשי)' : ''}</option>)}
          </select>
        </div>
      ))}
      <button className="btn light block" onClick={() => onEditCategory({ id: '', label: '', color: 'purple' })}>+ קטגוריה חדשה</button>
    </Sheet>
  )
}
