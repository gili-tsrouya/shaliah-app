import { useEffect, useMemo, useState } from 'react'
import { useAllEvents, useCategory } from '../lib/store'
import { cloudAvailable, maybeSignedIn } from '../lib/cloud'
import { deleteMemory, loadMemories, MOODS, saveMemory, type Memory, type MemoryKind } from '../lib/journal'
import { formatLongDay, todayISO } from '../lib/dates'
import { Icon } from '../components/Icon'
import { Fab, Sheet } from '../components/ui'

const DRAFT = 'shaliach-journal-draft' // text being written, so a closed app does not lose it

export function Journal() {
  const signedIn = maybeSignedIn()
  const [list, setList] = useState<Memory[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(location.hash.includes('new'))
  const [open, setOpen] = useState<{ m: Memory; i: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Memory | null>(null)

  const reload = () => loadMemories().then((l) => { setList(l); setError('') }).catch(() => setError('לא הצלחתי לטעון את הזיכרונות. בדקי את החיבור לאינטרנט.'))
  useEffect(() => { if (signedIn) reload() }, [signedIn])

  const today = todayISO()
  // The same day in earlier months or years
  const onThisDay = useMemo(() => (list ?? []).filter((m) => m.date !== today && m.date.slice(8) === today.slice(8) && (m.photos.length > 0 || m.body)).slice(0, 3), [list, today])
  const byMonth = useMemo(() => {
    const groups = new Map<string, Memory[]>()
    for (const m of list ?? []) groups.set(m.date.slice(0, 7), [...(groups.get(m.date.slice(0, 7)) ?? []), m])
    return [...groups.entries()]
  }, [list])
  const monthName = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  return (
    <main className="screen">
      <header className="row">
        <a href="#/home" className="icon-btn" aria-label="חזרה"><Icon name="chevronR" /></a>
        <div className="col" style={{ gap: 0 }}>
          <h1>זיכרונות</h1>
          <span className="muted small">רגעים ותמונות מהשליחות ומהחיים כאן</span>
        </div>
      </header>

      {(!cloudAvailable || !signedIn) && (
        <a href="#/account" className="card link-card" style={{ gap: 6 }}>
          <span className="bold">צריך להיכנס לחשבון</span>
          <span className="muted">התמונות נשמרות בחשבון שלך, פרטיות, ולא רק בטלפון. כניסה אחת עם Google וזהו.</span>
        </a>
      )}

      {signedIn && error && <p className="empty">{error}</p>}
      {signedIn && !error && list === null && <p className="empty">טוען…</p>}
      {signedIn && list?.length === 0 && (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', gap: 10, padding: 28 }}>
          <span className="bold" style={{ fontSize: 17 }}>הרגע הראשון מחכה</span>
          <span className="muted">תמונה אחת ושורה אחת על היום. בעוד שנה זה יהיה שווה הרבה.</span>
          <button className="btn" onClick={() => setAdding(true)}>להוסיף רגע</button>
        </div>
      )}

      {onThisDay.length > 0 && (
        <section className="card" style={{ gap: 8, background: 'var(--yj-bg)', borderColor: 'transparent' }}>
          <span className="bold" style={{ color: 'var(--yj-fg)' }}>ביום הזה</span>
          {onThisDay.map((m) => (
            <div key={m.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
              {m.photos[0]?.url && <img src={m.photos[0].url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover' }} />}
              <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                <span className="small bold">{formatLongDay(m.date)} {m.date.slice(0, 4)}</span>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body || m.eventTitle}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {byMonth.map(([key, items]) => (
        <section key={key} className="col" style={{ gap: 10 }}>
          <h2>{monthName(key)}</h2>
          {items.map((m) => (
            <article key={m.id} className="card" style={{ gap: 10 }}>
              <div className="between">
                <span className="small bold">{formatLongDay(m.date)}</span>
                <span className="row" style={{ gap: 6 }}>
                  {m.mood && <span className="tag" style={{ background: 'var(--ground)' }}>{m.mood}</span>}
                  <span className="tag" style={m.kind === 'shlichut' ? { background: 'var(--tzofim-bg)', color: 'var(--tzofim-fg)' } : { background: 'var(--personal-bg)', color: 'var(--personal-fg)' }}>
                    {m.kind === 'shlichut' ? 'שליחות' : 'אישי'}
                  </span>
                </span>
              </div>
              {m.eventTitle && <span className="muted small">{m.eventTitle}</span>}
              {m.photos.length > 0 && (
                <div className={`journal-photos n${Math.min(m.photos.length, 3)}`}>
                  {m.photos.map((p, i) => (
                    <button key={p.id} onClick={() => setOpen({ m, i })} aria-label="הגדלת התמונה">
                      {p.url ? <img src={p.url} alt="" loading="lazy" /> : <span className="muted small">התמונה לא נטענה</span>}
                    </button>
                  ))}
                </div>
              )}
              {m.body && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</p>}
              <div className="between">
                {m.photos.some((p) => p.youth)
                  ? <span className="muted small">תמונות עם חניכים נשארות פרטיות, רק כאן</span>
                  : <span />}
                <button className="icon-btn" style={{ width: 36, height: 36, border: 'none' }} aria-label="מחיקה" onClick={() => setConfirmDelete(m)}><Icon name="trash" size={16} /></button>
              </div>
            </article>
          ))}
        </section>
      ))}

      {signedIn && list && list.length > 0 && <Fab label="רגע חדש" onClick={() => setAdding(true)} />}
      {adding && signedIn && <AddMemory onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}

      {open && (
        <div className="sheet-backdrop" style={{ background: 'rgba(8,12,20,.94)', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpen(null)}>
          <img src={open.m.photos[open.i].url} alt="" style={{ maxWidth: '100%', maxHeight: '86vh', objectFit: 'contain' }} />
        </div>
      )}

      {confirmDelete && (
        <Sheet title="למחוק את הרגע?" onClose={() => setConfirmDelete(null)}>
          <p className="muted">הטקסט והתמונות של {formatLongDay(confirmDelete.date)} יימחקו.</p>
          <div className="row">
            <button className="btn danger" style={{ flex: 1 }} onClick={() => deleteMemory(confirmDelete).then(() => { setConfirmDelete(null); reload() }).catch(() => setError('המחיקה נכשלה.'))}>כן, למחוק</button>
            <button className="btn light" onClick={() => setConfirmDelete(null)}>ביטול</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}

function AddMemory({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const events = useAllEvents()
  const category = useCategory()
  const [date, setDate] = useState(todayISO())
  const [body, setBody] = useState(() => { try { return localStorage.getItem(DRAFT) ?? '' } catch { return '' } })
  const [mood, setMood] = useState<string | undefined>()
  const [kind, setKind] = useState<MemoryKind>('personal')
  const [eventId, setEventId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  useEffect(() => { try { localStorage.setItem(DRAFT, body) } catch { /* ignore */ } }, [body])

  const dayEvents = events.filter((e) => e.date === date && e.kind !== 'vacation')
  const pickEvent = (id: string) => {
    setEventId(id)
    const e = dayEvents.find((x) => x.id === id)
    // an event of a youth-work category makes this a shlichut memory, which keeps its photos private
    if (e) setKind(e.work === 'personal' ? 'personal' : ['tzofim', 'yj'].includes(e.work) ? 'shlichut' : kind)
  }

  const save = async () => {
    if (!body.trim() && files.length === 0) return setMsg('כתבי משהו או הוסיפי תמונה.')
    setBusy('שומר…')
    setMsg('')
    try {
      const e = dayEvents.find((x) => x.id === eventId)
      const res = await saveMemory({ date, body, mood, kind, eventLegacyId: e?.id, eventTitle: e ? `${e.title} · ${category(e.work).label}` : undefined }, files,
        (done, of) => setBusy(`מעלה תמונות ${done}/${of}`))
      try { localStorage.removeItem(DRAFT) } catch { /* ignore */ }
      if (res.failedPhotos) {
        setBusy('')
        setFiles([])
        return setMsg(`הרגע נשמר, אבל ${res.failedPhotos === 1 ? 'תמונה אחת לא עלתה' : `${res.failedPhotos} תמונות לא עלו`}. אפשר לסגור ולהוסיף אותן שוב ברגע חדש.`)
      }
      onSaved()
    } catch {
      setBusy('')
      setMsg('השמירה נכשלה. הטקסט נשמר כאן כטיוטה, אפשר לנסות שוב.')
    }
  }

  return (
    <Sheet title="רגע חדש" onClose={onClose}>
      <label className="field">מתי
        <input type="date" value={date} max={todayISO()} onChange={(e) => { setDate(e.target.value || todayISO()); setEventId('') }} />
      </label>
      {dayEvents.length > 0 && (
        <div className="field">קשור לאירוע מהיומן?
          <div className="chips" style={{ gap: 6 }}>
            {dayEvents.slice(0, 6).map((e) => (
              <button key={e.id} className={`chip small ${eventId === e.id ? 'on' : ''}`} aria-pressed={eventId === e.id} onClick={() => pickEvent(eventId === e.id ? '' : e.id)}>{e.title}</button>
            ))}
          </div>
        </div>
      )}
      <div className="field">סוג
        <div className="chips" style={{ gap: 6 }}>
          {([['personal', 'אישי'], ['shlichut', 'שליחות']] as const).map(([k, l]) => (
            <button key={k} className={`chip small ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        {kind === 'shlichut' && <span className="muted small">תמונות של רגע מהשליחות מסומנות כפרטיות (ייתכן שיש בהן חניכים) ונשארות רק באפליקציה.</span>}
      </div>
      <label className="field">מה היה?
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="שורה או שתיים על היום…" />
      </label>
      <div className="field">איך היה
        <div className="chips" style={{ gap: 6 }}>
          {MOODS.map((m) => (
            <button key={m} className={`chip small ${mood === m ? 'on' : ''}`} aria-pressed={mood === m} onClick={() => setMood(mood === m ? undefined : m)}>{m}</button>
          ))}
        </div>
      </div>
      {previews.length > 0 && (
        <div className="journal-photos n3">
          {previews.map((u, i) => (
            <button key={u} onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} aria-label="הסרת התמונה"><img src={u} alt="" /></button>
          ))}
        </div>
      )}
      <label className="btn light block row" style={{ justifyContent: 'center', cursor: 'pointer' }}>
        {files.length ? `עוד תמונות (${files.length} נבחרו, נגיעה בתמונה מסירה אותה)` : 'הוספת תמונות'}
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => {
            // read the chosen files now: clearing the input below empties the list it hands out
            const chosen = Array.from(e.target.files ?? [])
            e.target.value = ''
            setFiles((f) => [...f, ...chosen].slice(0, 10))
          }} />
      </label>
      <button className="btn block" disabled={!!busy} onClick={save}>{busy || 'שמירה'}</button>
      {msg && <p className="small" style={{ color: msg.startsWith('הרגע נשמר') ? 'var(--warn)' : 'var(--danger)' }}>{msg}</p>}
    </Sheet>
  )
}
