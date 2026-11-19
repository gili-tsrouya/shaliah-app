import { useCallback, useRef, useEffect, useState } from 'react'
import { useAllEvents, useCategory, useStore, newId } from '../lib/store'
import { colorOf, eventsOn } from '../lib/derive'
import { DAY_LETTERS, MONTHS, addDays, formatDay, formatLongDay, fromISO, toISO, todayISO, weekStart } from '../lib/dates'
import { COLORS, type CalCategory, type CalEvent, type EventKind, type Guest, type Work } from '../lib/types'
import * as G from '../lib/google'
import { cloudAvailable, maybeSignedIn } from '../lib/cloud'
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
  // A lasting connection through the account renews the token by itself, at most a few times per visit
  const serverTries = useRef(0)
  const [lasting, setLasting] = useState(false)
  useEffect(() => {
    if (token || serverTries.current >= 3) return
    serverTries.current++
    G.serverToken().then((t) => {
      if (!t) return
      setLasting(true)
      setToken(t)
      setSync((cur) => (cur === 'off' ? 'idle' : cur))
    })
  }, [token])
  const visible = Object.fromEntries(calCategories.map((c) => [c.id, !hidden[c.id]]))
  const [view, setView] = useState<'week' | 'month'>(() => {
    try {
      return localStorage.getItem('shaliach:calView') === 'month' ? 'month' : 'week'
    } catch {
      return 'week'
    }
  })
  const pickView = (v: 'week' | 'month') => {
    setView(v)
    try {
      localStorage.setItem('shaliach:calView', v)
    } catch {
      // remembered for this visit only
    }
  }
  const d0 = fromISO(day)
  const monthFirst = toISO(new Date(d0.getFullYear(), d0.getMonth(), 1))
  const monthLast = toISO(new Date(d0.getFullYear(), d0.getMonth() + 1, 0))
  // Week: Sunday–Saturday around the selected day. Month: whole weeks covering the month.
  const start = view === 'week' ? weekStart(day) : weekStart(monthFirst)
  const end = view === 'week' ? addDays(start, 6) : addDays(weekStart(monthLast), 6)
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const moveMonth = (n: number) => {
    const target = new Date(d0.getFullYear(), d0.getMonth() + n, 1)
    const t = fromISO(today)
    setDay(t.getFullYear() === target.getFullYear() && t.getMonth() === target.getMonth() ? today : toISO(target))
  }
  const move = (n: number) => (view === 'week' ? setDay(addDays(day, 7 * n)) : moveMonth(n))
  const dayEvents = eventsOn(all, day, visible)
  const vacations = all.filter((e) => e.kind === 'vacation' && (e.endDate ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date))
  const { syncCalls } = useStore()
  const syncCallsRef = useRef(syncCalls)
  syncCallsRef.current = syncCalls
  const linked = calCategories.filter((c) => c.googleCalendarId)

  const refresh = useCallback(async (tok: string) => {
    if (!linked.length) {
      setGoogleEvents([])
      return
    }
    setSync('syncing')
    try {
      // Repeating calls from the stay-in-touch list first, so they come back with the fetch
      await syncCallsRef.current(tok).catch(() => {})
      const from = addDays(today < start ? today : start, -30)
      const to = addDays(end > today ? end : today, 120)
      // One fetch per Google calendar, even if two categories point at it by mistake
      const byCalendar = new Map(linked.map((c) => [c.googleCalendarId!, c.id]))
      const lists = await Promise.all([...byCalendar].map(([cal, work]) => G.fetchEvents(tok, cal, work, from, to)))
      setGoogleEvents(lists.flat())
      setSync('idle')
      setError('')
    } catch (e) {
      if ((e as Error).message === 'expired') setToken(null)
      setSync('error')
      setError('הסנכרון נכשל. לחצו "סנכרן" כדי להתחבר מחדש.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked.map((c) => c.googleCalendarId + c.id).join(), start, end, today, setGoogleEvents])

  // Pull on open and when moving between weeks, if we still hold a valid token
  useEffect(() => {
    if (token) refresh(token)
  }, [token, refresh])

  const ensureToken = async () => {
    if (token) return token
    const fromServer = await G.serverToken()
    if (fromServer) {
      setToken(fromServer)
      return fromServer
    }
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
        if (wasGoogle && before!.googleCalendarId === target) await G.updateEvent(tok, target!, before!.googleId!, e, before!)
        else {
          if (wasGoogle) await G.deleteEvent(tok, before!.googleCalendarId!, before!.googleId!, before!)
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
        await G.deleteEvent(tok, e.googleCalendarId, e.googleId, e)
        setGoogleEvents((es) => es.filter((x) => x.id !== e.id))
      } catch {
        setError('לא הצלחתי למחוק ב-Google Calendar.')
      }
    } else setEvents((es) => es.filter((x) => x.id !== e.id))
  }

  // emails she invited before, offered as suggestions
  const knownGuests = [...new Set(all.flatMap((e) => (e.guests ?? []).map((g) => g.email)))].sort()

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
      {!token && !lasting && linked.length > 0 && settings.googleClientId && (
        <button className="card" style={{ textAlign: 'start', borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 700 }}
          onClick={async () => {
            try {
              setToken(await G.connect(settings.googleClientId!))
            } catch {
              setShowSync(true)
            }
          }}>
          החיבור ל-Google פג (זה קורה כל שעה) — לחצו כאן כדי להתחבר שוב ולסנכרן
        </button>
      )}
      {token && linked.length === 0 && (
        <button className="card" style={{ textAlign: 'start', borderColor: 'var(--warn)', color: 'var(--warn)' }} onClick={() => setShowSync(true)}>
          מחובר ל-Google, אבל אף קטגוריה לא מקושרת ליומן Google — לחצו כאן ובחרו יומן לכל קטגוריה.
        </button>
      )}

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

      <div className="segmented" role="group" aria-label="תצוגה">
        {(['week', 'month'] as const).map((v) => (
          <a key={v} href="#/calendar" className={view === v ? 'on' : ''} aria-pressed={view === v}
            onClick={(e) => { e.preventDefault(); pickView(v) }}>{v === 'week' ? 'שבוע' : 'חודש'}</a>
        ))}
      </div>

      <div className="between">
        <button className="icon-btn" aria-label={view === 'week' ? 'שבוע קודם' : 'חודש קודם'} onClick={() => move(-1)}><Icon name="chevronR" /></button>
        <button className="chip" style={{ border: 'none', background: 'none', fontWeight: 700, fontSize: 16 }} onClick={() => setDay(today)}>
          {view === 'week' ? `${formatDay(days[0])} – ${formatDay(days[6])}` : `${MONTHS[d0.getMonth()]} ${d0.getFullYear()}`}
        </button>
        <button className="icon-btn" aria-label={view === 'week' ? 'שבוע הבא' : 'חודש הבא'} onClick={() => move(1)}><Icon name="chevronL" /></button>
      </div>

      {view === 'month' && (
        <div className="week" aria-hidden="true" style={{ marginBottom: -8 }}>
          {DAY_LETTERS.map((l) => <span key={l} className="small muted" style={{ textAlign: 'center' }}>{l}</span>)}
        </div>
      )}
      <div className={`week ${view === 'month' ? 'month' : ''}`}>
        {days.map((d, i) => {
          const on = eventsOn(all, d, visible)
          const outside = view === 'month' && (d < monthFirst || d > monthLast)
          return (
            <button key={d} className={`${d === day ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDay(d)}
              aria-label={formatLongDay(d)} aria-pressed={d === day} style={outside ? { opacity: 0.4 } : undefined}>
              {view === 'week' && <span className="small">{DAY_LETTERS[i]}</span>}
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
              onClick={() => (e.id.startsWith('call_') ? (location.hash = '#/self/contacts') : setEditing(e))}>
              <span className="time ltr">{e.kind === 'vacation' ? '—' : e.start ?? 'כל היום'}</span>
              <span className="col" style={{ gap: 2, flex: 1 }}>
                <span className="title">{e.title}</span>
                <span className="small bold">{cat(e.work).label}{e.kind === 'deadline' ? ' · דדליין' : e.kind === 'vacation' ? ' · חופשה' : ''}{e.googleId ? ' · Google' : ''}</span>
                {e.guests && e.guests.length > 0 && <span className="small">{guestSummary(e.guests)}</span>}
              </span>
            </button>
          )
        })}
        {dayEvents.filter((e) => e.meetLink).map((e) => (
          <a key={`meet_${e.id}`} className="btn light row" style={{ justifyContent: 'center', gap: 8 }} href={e.meetLink} target="_blank" rel="noreferrer">
            <Icon name="video" size={18} /> להצטרף ל-Meet: {e.title}
          </a>
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

      <Fab label="אירוע" onClick={() => setEditing({ id: '', title: '', work: calCategories[0]?.id ?? 'personal', kind: 'event', date: day })} />

      {editing && <EventSheet event={editing} categories={calCategories} known={knownGuests} onClose={() => setEditing(null)}
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

const STATUS: Record<string, string> = { accepted: 'מגיע/ה', declined: 'לא מגיע/ה', tentative: 'אולי', needsAction: 'עוד לא ענה/תה' }

function guestSummary(guests: Guest[]) {
  const yes = guests.filter((g) => g.status === 'accepted').length
  const no = guests.filter((g) => g.status === 'declined').length
  return `${guests.length === 1 ? 'מוזמן אחד' : `${guests.length} מוזמנים`}${yes ? `, ${yes} אישרו` : ''}${no ? `, ${no} לא מגיעים` : ''}`
}

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

function EventSheet({ event, categories, known, onClose, onSave, onDelete }: {
  event: CalEvent; categories: CalCategory[]; known: string[]; onClose: () => void; onSave: (e: CalEvent) => void; onDelete: () => void
}) {
  const [kind, setKind] = useState<EventKind>(event.kind)
  const [work, setWork] = useState(event.work)
  const [guests, setGuests] = useState<Guest[]>(event.guests ?? [])
  const [typed, setTyped] = useState('')
  const [meet, setMeet] = useState(!!event.meet || !!event.meetLink)
  const [bad, setBad] = useState('')
  const toGoogle = !!categories.find((c) => c.id === work)?.googleCalendarId
  const readOnly = !!event.invitedBy
  // adds whatever was typed; several addresses can be pasted at once, separated by commas or spaces
  const addTyped = () => {
    const parts = typed.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return true
    const wrong = parts.filter((x) => !validEmail(x))
    if (wrong.length) {
      setBad(`זו לא כתובת מייל: ${wrong.join(', ')}`)
      return false
    }
    setGuests((gs) => [...gs, ...parts.filter((x) => !gs.some((g) => g.email === x)).map((email) => ({ email }))])
    setTyped('')
    setBad('')
    return true
  }
  return (
    <Sheet title={event.id ? 'עריכת אירוע' : 'אירוע חדש'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        if (toGoogle && !readOnly && !addTyped()) return
        const f = new FormData(ev.currentTarget)
        // an address typed but not yet added counts too
        const pending = toGoogle && !readOnly ? typed.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(validEmail) : []
        const all = [...guests, ...pending.filter((x) => !guests.some((g) => g.email === x)).map((email) => ({ email }))]
        const s = (k: string) => String(f.get(k) || '') || undefined
        onSave({
          ...event, id: event.id || newId(), title: String(f.get('title')), work: String(f.get('work')), kind,
          date: String(f.get('date')),
          endDate: kind === 'vacation' ? s('endDate') : undefined,
          start: kind === 'vacation' ? undefined : s('start'),
          end: kind === 'event' ? s('end') : undefined,
          guests: toGoogle ? (readOnly ? event.guests : all) : event.guests,
          meet: toGoogle && kind === 'event' && meet ? true : undefined,
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
          <select name="work" value={work} onChange={(ev) => setWork(ev.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.googleCalendarId ? ' (Google)' : ''}</option>)}</select>
        </label>
        <div className="grid2">
          <label className="field">{kind === 'vacation' ? 'מתאריך' : 'תאריך'}<input name="date" type="date" defaultValue={event.date} required /></label>
          {kind === 'vacation'
            ? <label className="field">עד תאריך<input name="endDate" type="date" defaultValue={event.endDate ?? event.date} /></label>
            : <label className="field">{kind === 'deadline' ? 'עד שעה' : 'משעה'}<input name="start" type="time" defaultValue={event.start} /></label>}
        </div>
        {kind === 'event' && <label className="field">עד שעה<input name="end" type="time" defaultValue={event.end} /></label>}

        {kind !== 'vacation' && (
          <div className="field">
            מוזמנים
            {!toGoogle && <span className="small muted">כדי להזמין אנשים במייל, בחרי קטגוריה שמחוברת ל-Google. Google שולח את ההזמנות.</span>}
            {readOnly && <span className="small muted">האירוע נשלח אלייך מ-{event.invitedBy}, ורשימת המוזמנים שלו.</span>}
            {guests.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                {guests.map((g) => (
                  <div key={g.email} className="between" style={{ gap: 8 }}>
                    <span className="col" style={{ gap: 0, minWidth: 0 }}>
                      <span dir="ltr" style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.email}</span>
                      {g.status && <span className="small muted">{STATUS[g.status]}</span>}
                    </span>
                    {toGoogle && !readOnly && (
                      <button type="button" className="icon-btn" style={{ width: 36, height: 36, border: 'none' }} aria-label={`להסיר את ${g.email}`}
                        onClick={() => setGuests((gs) => gs.filter((x) => x.email !== g.email))}><Icon name="x" size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {toGoogle && !readOnly && (
              <div className="row" style={{ gap: 8 }}>
                <input className="ltr" type="email" inputMode="email" autoComplete="off" list="known-guests" placeholder="name@example.com" style={{ flex: 1 }}
                  value={typed} onChange={(ev) => { setTyped(ev.target.value); setBad('') }}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTyped() } }} />
                <button type="button" className="btn light" disabled={!typed.trim()} onClick={addTyped}>הוספה</button>
                <datalist id="known-guests">{known.filter((k) => !guests.some((g) => g.email === k)).map((k) => <option key={k} value={k} />)}</datalist>
              </div>
            )}
            {bad && <span className="small" style={{ color: 'var(--danger)' }}>{bad}</span>}
            {toGoogle && !readOnly && guests.length > 0 && <span className="small muted">בשמירה Google ישלח להם הזמנה במייל, ועדכון אם משהו ישתנה.</span>}
          </div>
        )}
        {toGoogle && !readOnly && kind === 'event' && (
          event.meetLink
            ? <a className="small bold" href={event.meetLink} target="_blank" rel="noreferrer">קישור ל-Google Meet</a>
            : (
              <label className="row" style={{ gap: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={meet} onChange={(ev) => setMeet(ev.target.checked)} style={{ width: 22, height: 22 }} />
                להוסיף קישור לשיחת Google Meet
              </label>
            )
        )}
        <button className="btn block" type="submit">{toGoogle && !readOnly && guests.length > 0 && !event.id ? 'שמירה ושליחת הזמנות' : 'שמור'}</button>
        {event.id && <button type="button" className="btn danger block" onClick={() => { onDelete(); onClose() }}>{event.guests?.length && !readOnly ? 'מחק ושלח ביטול למוזמנים' : 'מחק'}</button>}
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
    if (!token) return
    G.listCalendars(token).then((list) => {
      setCalendars(list)
      // First connection: link "personal" to the main Google calendar so syncing starts right away
      const primary = list.find((g) => g.primary)
      setCalCategories((cs) => (primary && !cs.some((c) => c.googleCalendarId)
        ? cs.map((c) => (c.id === 'personal' ? { ...c, googleCalendarId: primary.id } : c))
        : cs))
    }).catch(() => setMsg('לא הצלחתי לקרוא את רשימת היומנים.'))
  }, [token, setCalCategories])

  const [lasting, setLasting] = useState<boolean | null>(null)
  useEffect(() => { G.serverToken().then((t) => setLasting(!!t)) }, [])

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
      {cloudAvailable && (
        <div className="card" style={{ gap: 8, borderColor: lasting ? 'var(--ok)' : 'var(--primary)' }}>
          {lasting ? (
            <>
              <span className="bold" style={{ color: 'var(--ok)' }}>חיבור קבוע פעיל</span>
              <span className="muted small">החיבור ל-Google מתחדש לבד, בלי להתחבר שוב כל שעה.</span>
              <button className="btn light" onClick={async () => { await G.disconnectServer(); setLasting(false); onDisconnect() }}>ביטול החיבור הקבוע</button>
            </>
          ) : maybeSignedIn() ? (
            <>
              <span className="bold">חיבור קבוע ל-Google</span>
              <span className="muted small">מאשרים פעם אחת ב-Google, ומאז הסנכרון ממשיך לבד בלי "החיבור פג" כל שעה. היומן ממשיך לעבוד בדיוק כמו היום.</span>
              <button className="btn" disabled={lasting === null}
                onClick={() => G.startServerConnect().catch(() => setMsg('לא הצלחתי להתחיל את החיבור. נסי שוב.'))}>חיבור קבוע</button>
            </>
          ) : (
            <a href="#/account" className="small bold" style={{ textDecoration: 'none' }}>כניסה לחשבון מאפשרת חיבור קבוע ל-Google, בלי להתחבר שוב כל שעה</a>
          )}
        </div>
      )}
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
            onChange={(e) => {
              const cal = e.target.value || undefined
              setCalCategories((cs) => cs.map((x) => (x.id === c.id ? { ...x, googleCalendarId: cal }
                : x.googleCalendarId === cal ? { ...x, googleCalendarId: undefined } : x)))
            }}>
            <option value="">רק באפליקציה</option>
            {c.googleCalendarId && !calendars && <option value={c.googleCalendarId}>{c.googleCalendarId}</option>}
            {calendars?.map((g) => {
              const owner = calCategories.find((x) => x.id !== c.id && x.googleCalendarId === g.id)
              return <option key={g.id} value={g.id}>{g.summary}{g.primary ? ' (ראשי)' : ''}{owner ? ` — יעבור מ${owner.label}` : ''}</option>
            })}
          </select>
        </div>
      ))}
      <button className="btn light block" onClick={() => onEditCategory({ id: '', label: '', color: 'purple' })}>+ קטגוריה חדשה</button>
    </Sheet>
  )
}
