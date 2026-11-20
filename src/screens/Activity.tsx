import { useEffect, useState } from 'react'
import { useStore, newId } from '../lib/store'
import { activityHtml, awaitingRun, duplicate, endTime, isReady, runsOf, equipmentOf, equipmentText, fileSafe, shareFile, slots, totalMinutes, withId } from '../lib/activities'
import { METHOD_FAMILIES } from '../lib/methods'
import { formatDay } from '../lib/dates'
import type { Activity as ActivityT, ActivityMethod, ActivityRun } from '../lib/types'
import { BackLink, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'

type Method = ActivityMethod & { id: string }

const idFromHash = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id') ?? ''
const FEELS = ['מעולה', 'טוב', 'בסדר', 'קשה']

export function Activity() {
  const { activities, setActivities, partnerships, calCategories, setEvents, methodBank, setMethodBank } = useStore()
  const [id, setId] = useState(idFromHash)
  useEffect(() => {
    const onHash = () => setId(idFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const a = activities.find((x) => x.id === id)
  const [open, setOpen] = useState<string | null>(null)
  const [editingMethod, setEditingMethod] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState('')
  const [openRun, setOpenRun] = useState<string | null>(null)

  if (!a) {
    return (
      <main className="screen">
        <BackLink href="#/activities" label="הפעילויות שלי" />
        <p className="empty">הפעילות לא נמצאה. אולי היא נמחקה.</p>
      </main>
    )
  }

  const update = (patch: Partial<ActivityT>) =>
    setActivities((as) => as.map((x) => (x.id === a.id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)))
  const setMethods = (fn: (ms: Method[]) => Method[]) => update({ methods: fn(a.methods) })
  const move = (mid: string, d: number) => setMethods((ms) => {
    const i = ms.findIndex((m) => m.id === mid)
    const j = i + d
    if (j < 0 || j >= ms.length) return ms
    const next = [...ms]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const addMethod = (m: ActivityMethod, edit = false) => {
    const added = withId(m)
    setMethods((ms) => [...ms, added])
    setOpen(added.id)
    setEditingMethod(edit ? added.id : null)
    setPicking(false)
  }
  const partner = partnerships.find((p) => p.id === a.partnershipId)
  const times = slots(a)
  const gear = equipmentOf(a)
  const packed = new Set(a.packed ?? [])
  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(''), 3000)
  }

  const runs = runsOf(a)
  // any change to the runs saves the full list (an old single review becomes the first run)
  const saveRuns = (next: ActivityRun[]) => update({ runs: next.map((x) => (x.id === 'legacy' ? { ...x, id: newId() } : x)) })
  const setRun = (rid: string, patch: Partial<ActivityRun>) => saveRuns(runs.map((x) => (x.id === rid ? { ...x, ...patch } : x)))
  const logRun = (date: string, clearPlan: boolean) => {
    const run: ActivityRun = { id: newId(), date, partnershipId: a.partnershipId }
    const next = [run, ...runs].map((x) => (x.id === 'legacy' ? { ...x, id: newId() } : x))
    update({ runs: next, status: 'ready', ...(clearPlan ? { date: undefined, start: undefined } : {}) })
    setOpenRun(run.id)
  }
  const today = new Date().toLocaleDateString('en-CA')
  const partnerName = (pid?: string) => partnerships.find((p) => p.id === pid)?.name

  const toCalendar = () => {
    if (!a.date) return
    const ev = { id: a.calendarEventId ?? newId(), title: a.title || 'פעילות', work: a.work ?? calCategories[0]?.id ?? 'personal', kind: 'event' as const, date: a.date as string, start: a.start, end: endTime(a) }
    setEvents((es) => (es.some((e) => e.id === ev.id) ? es.map((e) => (e.id === ev.id ? { ...e, ...ev } : e)) : [...es, ev]))
    update({ calendarEventId: ev.id })
    flash(a.calendarEventId ? 'היומן עודכן' : 'נוסף ליומן')
  }

  return (
    <main className="screen">
      <div className="between no-print">
        <BackLink href="#/activities" label="הפעילויות שלי" />
        <button className="icon-btn" style={{ border: 0 }} aria-label="ייצוא כקובץ" onClick={() => setExporting(true)}><Icon name="share" size={20} /></button>
      </div>

      <div className="segmented" aria-label="מצב הפעילות">
        {(['draft', 'ready'] as const).map((st) => {
          const on = st === 'ready' ? isReady(a) : !isReady(a)
          return (
            <button key={st} className={on ? 'on' : ''} aria-pressed={on} onClick={() => update({ status: st })}>
              {st === 'draft' ? 'טיוטה' : 'מוכנה לשימוש'}
            </button>
          )
        })}
      </div>

      <header className="col" style={{ gap: 4 }}>
        <label className="sr-only" htmlFor="act-title">שם הפעילות</label>
        <textarea id="act-title" className="plain-input" rows={Math.max(1, Math.ceil(a.title.length / 18))} style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2, resize: 'none' }}
          placeholder="שם הפעילות" value={a.title} onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })} />
        {a.fromIdeaId && <span className="muted small">נבנתה מרעיון של הסוכן</span>}
      </header>

      {awaitingRun(a, today) && (
        <div className="card hero" style={{ gap: 10 }}>
          <span className="bold">הפעילות הייתה מתוכננת ל{formatDay(a.date!)}. העברת אותה?</span>
          <div className="row">
            <button className="btn white" style={{ flex: 1 }} onClick={() => logRun(a.date!, true)}>כן, העברתי</button>
            <button className="btn" style={{ background: 'transparent', border: '1px solid #55595F' }} onClick={() => update({ date: undefined, start: undefined })}>לא, להוריד את התאריך</button>
          </div>
        </div>
      )}

      <label className="card" style={{ gap: 4 }}>
        <span className="small bold" style={{ color: 'var(--muted)' }}>מטרה</span>
        <textarea className="plain-input" rows={2} style={{ fontSize: 17, lineHeight: 1.5, resize: 'none' }} placeholder="מה החניכים יחשבו, ירגישו או יעשו עד הסוף?"
          value={a.goal} onChange={(e) => update({ goal: e.target.value })} />
      </label>

      <div className="group facts">
        <label><span className="small muted bold">שייך ל</span>
          <select value={a.work ?? ''} onChange={(e) => update({ work: e.target.value || undefined })}>
            <option value="">לבחור</option>{calCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label><span className="small muted bold">שותפות</span>
          <select value={a.partnershipId ?? ''} onChange={(e) => {
            const p = partnerships.find((x) => x.id === e.target.value)
            update({ partnershipId: p?.id, ageFrom: a.ageFrom ?? p?.ageFrom, ageTo: a.ageTo ?? p?.ageTo })
          }}>
            <option value="">בלי</option>{partnerships.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div><span className="small muted bold">גילאים</span>
          <span className="row" style={{ gap: 4 }}>
            <input aria-label="מגיל" type="number" inputMode="numeric" value={a.ageFrom ?? ''} style={{ width: 44 }} onChange={(e) => update({ ageFrom: Number(e.target.value) || undefined })} />–
            <input aria-label="עד גיל" type="number" inputMode="numeric" value={a.ageTo ?? ''} style={{ width: 44 }} onChange={(e) => update({ ageTo: Number(e.target.value) || undefined })} />
          </span>
        </div>
        <div><span className="small muted bold">משך</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{totalMinutes(a)} דקות</span>
          <span className="small muted">מחושב מהמתודות</span>
        </div>
        <label><span className="small muted bold">מתוכננת ל (לא חובה)</span>
          <span className="row" style={{ gap: 4 }}>
            <input type="date" value={a.date ?? ''} onChange={(e) => update({ date: e.target.value || undefined })} />
            {a.date && <button type="button" className="text-btn small" aria-label="בלי תאריך" onClick={() => update({ date: undefined, start: undefined })}><Icon name="x" size={16} /></button>}
          </span>
        </label>
        <label><span className="small muted bold">שעה (לא חובה)</span>
          <input type="time" value={a.start ?? ''} onChange={(e) => update({ start: e.target.value || undefined })} />
        </label>
      </div>

      <section className="col" style={{ gap: 8 }}>
        <div className="section-head" style={{ padding: '0 4px' }}>
          <h2>מהלך הפעילות</h2>
          <span className="small bold" style={{ color: 'var(--muted)' }}>{a.methods.length === 1 ? 'מתודה אחת' : `${a.methods.length} מתודות`}</span>
        </div>
        {a.methods.length > 0 && (
          <div className="group">
            {a.methods.map((m, i) => (
              <div key={m.id}>
                <button className="group-row" style={{ border: 0, minHeight: 64 }} aria-expanded={open === m.id} onClick={() => { setOpen(open === m.id ? null : m.id); setEditingMethod(null) }}>
                  <span className="method-num">{i + 1}</span>
                  <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{m.name || 'מתודה בלי שם'}</span>
                    <span className="small muted">{m.family}, {m.minutes} דקות</span>
                  </span>
                  {times[i] && <span className="small bold ltr" style={{ color: 'var(--ink2)' }}>{times[i]}</span>}
                </button>
                {open === m.id && editingMethod !== m.id && (
                  <div className="col" style={{ padding: '0 16px 14px', paddingInlineStart: 56, gap: 10 }}>
                    {m.purpose && <div className="col" style={{ gap: 2 }}><span className="small bold muted">למה</span><span>{m.purpose}</span></div>}
                    {m.content && <div className="col" style={{ gap: 2 }}><span className="small bold muted">מה עושים</span><span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span></div>}
                    {m.equipment.length > 0 && <div className="chips" style={{ gap: 6 }}>{m.equipment.map((g) => <span key={g} className="tag" style={{ background: 'var(--ground)' }}>{g}</span>)}</div>}
                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="להזיז למעלה" onClick={() => move(m.id, -1)}><Icon name="up" size={18} /></button>
                      <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="להזיז למטה" onClick={() => move(m.id, 1)}><Icon name="down" size={18} /></button>
                      <button className="chip" onClick={() => setEditingMethod(m.id)}>עריכה</button>
                      <button className="chip" onClick={() => {
                        const { id: _id, ...rest } = m
                        void _id
                        setMethodBank((b) => [...b.filter((x) => x.name !== m.name || x.family !== m.family), withId(rest)])
                        flash('נשמרה במתודות שלך')
                      }}>לשמור במתודות שלי</button>
                      <button className="chip" style={{ color: 'var(--danger)', borderColor: 'transparent' }} onClick={() => setMethods((ms) => ms.filter((x) => x.id !== m.id))}>להסיר</button>
                    </div>
                  </div>
                )}
                {open === m.id && editingMethod === m.id && (
                  <MethodForm method={m} onDone={(next) => { setMethods((ms) => ms.map((x) => (x.id === m.id ? next : x))); setEditingMethod(null) }} />
                )}
              </div>
            ))}
          </div>
        )}
        <button className="add-dashed" onClick={() => setPicking(true)}><Icon name="plus" size={18} stroke={2.4} />הוספת מתודה</button>
      </section>

      {gear.length > 0 && (
        <section className="col" style={{ gap: 8 }}>
          <div className="section-head" style={{ padding: '0 4px' }}>
            <h2>ציוד</h2>
            <span className="small bold" style={{ color: 'var(--muted)' }}>ארזת {gear.filter((g) => packed.has(g.name)).length} מתוך {gear.length}</span>
          </div>
          <div className="group">
            {gear.map((g) => (
              <label key={g.name} className="group-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={packed.has(g.name)} style={{ width: 22, height: 22, accentColor: '#000' }}
                  onChange={() => update({ packed: packed.has(g.name) ? [...packed].filter((x) => x !== g.name) : [...packed, g.name] })} />
                <span style={{ flex: 1, fontWeight: 600, color: packed.has(g.name) ? 'var(--muted)' : undefined, textDecoration: packed.has(g.name) ? 'line-through' : undefined }}>{g.name}</span>
                {g.count > 1 && <span className="small muted">ב-{g.count} מתודות</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="col" style={{ gap: 8 }}>
        <div className="section-head" style={{ padding: '0 4px' }}>
          <h2>העברות</h2>
          <span className="small bold" style={{ color: 'var(--muted)' }}>{runs.length === 0 ? 'עוד לא הועברה' : runs.length === 1 ? 'הועברה פעם אחת' : `הועברה ${runs.length} פעמים`}</span>
        </div>
        <button className="btn light block" onClick={() => logRun(today, a.date === today)}>העברתי את הפעילות היום</button>
        {runs.length > 0 && (
          <div className="group">
            {runs.map((run) => (
              <div key={run.id}>
                <button className="group-row" style={{ border: 0 }} aria-expanded={openRun === run.id} onClick={() => setOpenRun(openRun === run.id ? null : run.id)}>
                  <span className="col" style={{ gap: 1, flex: 1 }}>
                    <span className="bold">{formatDay(run.date)}{partnerName(run.partnershipId) ? `, ${partnerName(run.partnershipId)}` : ''}</span>
                    <span className="small muted">{[run.feel, run.came ? `${run.came} חניכים` : '', run.change ? 'יש מה לשנות' : ''].filter(Boolean).join(', ') || 'לחצי כדי לכתוב איך היה'}</span>
                  </span>
                  <Icon name={openRun === run.id ? 'up' : 'down'} size={18} />
                </button>
                {openRun === run.id && (
                  <div className="col" style={{ padding: '0 16px 16px', gap: 14 }}>
                    <div className="grid2">
                      <label className="field">מתי<input type="date" value={run.date} onChange={(e) => e.target.value && setRun(run.id, { date: e.target.value })} /></label>
                      <label className="field">עם מי
                        <select value={run.partnershipId ?? ''} onChange={(e) => setRun(run.id, { partnershipId: e.target.value || undefined })}>
                          <option value="">בלי</option>{partnerships.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="col" style={{ gap: 6 }}>
                      <span className="bold">איך הרגשת שזה עבר?</span>
                      <div className="grid4">
                        {FEELS.map((f) => (
                          <button key={f} className={`chip ${run.feel === f ? 'on' : ''}`} style={{ justifyContent: 'center' }} aria-pressed={run.feel === f}
                            onClick={() => setRun(run.id, { feel: run.feel === f ? undefined : f })}>{f}</button>
                        ))}
                      </div>
                    </div>
                    <label className="between bold">כמה חניכים הגיעו
                      <input type="number" inputMode="numeric" value={run.came ?? ''} style={{ width: 80, height: 44, borderRadius: 10, border: '1px solid #D5D8DD', textAlign: 'center', fontSize: 17 }}
                        onChange={(e) => setRun(run.id, { came: Number(e.target.value) || undefined })} />
                    </label>
                    <label className="field">מה עבד
                      <textarea rows={2} value={run.worked ?? ''} placeholder="למשל: הפתיחה הכניסה אותם מהר" onChange={(e) => setRun(run.id, { worked: e.target.value })} />
                    </label>
                    <label className="field">מה לשנות בפעם הבאה
                      <textarea rows={2} value={run.change ?? ''} placeholder="למשל: הדיון היה ארוך מדי" onChange={(e) => setRun(run.id, { change: e.target.value })} />
                    </label>
                    <button className="text-btn" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => saveRuns(runs.filter((x) => x.id !== run.id))}>למחוק את ההעברה הזאת</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {runs.find((x) => x.change) && (
          <p className="small" style={{ color: 'var(--ink2)', padding: '0 4px' }}>בפעם הקודמת כתבת לשנות: {runs.find((x) => x.change)!.change}</p>
        )}
      </section>

      <div className="col no-print" style={{ gap: 8 }}>
        {a.date
          ? <button className="btn block" onClick={toCalendar}>{a.calendarEventId ? 'לעדכן ביומן' : 'להוסיף ליומן'}</button>
          : <span className="small muted" style={{ textAlign: 'center' }}>אין תאריך, אז הפעילות שמורה לשימוש מתי שתרצי. כדי להוסיף ליומן, בוחרים תאריך למעלה.</span>}
        <button className="btn light block" onClick={() => {
          const copy = duplicate(a)
          setActivities((as) => [...as, copy])
          location.hash = `#/activity?id=${copy.id}`
        }}>לשכפל לשותפות אחרת</button>
        {!confirmDelete
          ? <button className="text-btn" style={{ color: 'var(--danger)', alignSelf: 'center' }} onClick={() => setConfirmDelete(true)}>מחיקת הפעילות</button>
          : (
            <div className="row">
              <button className="btn danger" style={{ flex: 1 }} onClick={() => { setActivities((as) => as.filter((x) => x.id !== a.id)); location.hash = '#/activities' }}>כן, למחוק</button>
              <button className="btn light" onClick={() => setConfirmDelete(false)}>ביטול</button>
            </div>
          )}
        {note && <span className="bold" role="status" style={{ textAlign: 'center' }}>{note}</span>}
      </div>

      {picking && <MethodPicker bank={methodBank} onPick={(m, edit) => addMethod(m, edit)} onClose={() => setPicking(false)} />}

      {exporting && (
        <Sheet title="ייצוא כקובץ" onClose={() => setExporting(false)}>
          <div className="group" style={{ background: 'var(--ground)' }}>
            <a className="group-row" href={`#/activity-print?id=${a.id}`}>
              <span className="file-ext">PDF</span>
              <span className="col" style={{ gap: 1, flex: 1 }}><span className="bold">PDF להדפסה ולשליחה</span><span className="small muted">נפתח מסך הדפסה. בו בוחרים "שמירה כ-PDF" או שיתוף</span></span>
            </a>
            <button className="group-row" style={{ border: 0 }} onClick={() => shareFile(`${fileSafe(a.title)}.doc`, activityHtml(a, partner?.name), 'application/msword')}>
              <span className="file-ext">DOC</span>
              <span className="col" style={{ gap: 1, flex: 1 }}><span className="bold">קובץ Word לעריכה</span><span className="small muted">לצוות שרוצה לשנות לפני הפעולה</span></span>
            </button>
            <button className="group-row" style={{ border: 0 }} disabled={!gear.length} onClick={() => shareFile(`ציוד - ${fileSafe(a.title)}.txt`, equipmentText(a), 'text/plain')}>
              <span className="file-ext">TXT</span>
              <span className="col" style={{ gap: 1, flex: 1 }}><span className="bold">רשימת ציוד בלבד</span><span className="small muted">{gear.length ? 'למי שאחראי על הציוד' : 'אין ציוד בפעילות הזאת'}</span></span>
            </button>
          </div>
        </Sheet>
      )}
    </main>
  )
}

function MethodForm({ method, onDone }: { method: Method; onDone: (m: Method) => void }) {
  return (
    <form className="col" style={{ padding: '0 16px 16px', gap: 12 }} onSubmit={(ev) => {
      ev.preventDefault()
      const f = new FormData(ev.currentTarget)
      onDone({
        ...method,
        name: String(f.get('name') ?? '').trim(),
        family: String(f.get('family') ?? ''),
        minutes: Math.max(0, Number(f.get('minutes')) || 0),
        purpose: String(f.get('purpose') ?? '').trim(),
        content: String(f.get('content') ?? '').trim(),
        equipment: String(f.get('equipment') ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      })
    }}>
      <label className="field">שם<input name="name" defaultValue={method.name} required autoFocus /></label>
      <div className="grid2">
        <label className="field">משפחה
          <select name="family" defaultValue={method.family}>{METHOD_FAMILIES.map((f) => <option key={f.name}>{f.name}</option>)}</select>
        </label>
        <label className="field">דקות<input name="minutes" type="number" inputMode="numeric" min={0} defaultValue={method.minutes} /></label>
      </div>
      <label className="field">למה (המטרה של המתודה)<textarea name="purpose" rows={2} defaultValue={method.purpose} /></label>
      <label className="field">מה עושים<textarea name="content" rows={4} defaultValue={method.content} /></label>
      <label className="field">ציוד (מופרד בפסיקים)<input name="equipment" defaultValue={method.equipment.join(', ')} placeholder="פתקים, טושים" /></label>
      <button className="btn block" type="submit">שמירת המתודה</button>
    </form>
  )
}

function MethodPicker({ bank, onPick, onClose }: { bank: Method[]; onPick: (m: ActivityMethod, edit: boolean) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'mine' | 'families'>(bank.length ? 'mine' : 'families')
  const [family, setFamily] = useState<string>('הכל')
  useEffect(() => { if (!bank.length) setTab('families') }, [bank.length])
  const blank = (fam: string, name = ''): ActivityMethod => ({ family: fam, name, minutes: 10, purpose: '', content: '', equipment: [] })
  const mine = bank.filter((m) => family === 'הכל' || m.family === family)
  return (
    <Sheet title="הוספת מתודה" onClose={onClose}>
      <div className="segmented">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>המתודות שלי{bank.length ? ` ${bank.length}` : ''}</button>
        <button className={tab === 'families' ? 'on' : ''} onClick={() => setTab('families')}>לפי משפחה</button>
      </div>
      {tab === 'mine' && (
        <>
          {bank.length === 0 && <p className="empty">עוד לא שמרת מתודות. בתוך פעילות, פותחים מתודה ולוחצים "לשמור במתודות שלי".</p>}
          {bank.length > 0 && (
            <div className="chips" style={{ gap: 6 }}>
              {['הכל', ...new Set(bank.map((m) => m.family))].map((f) => (
                <button key={f} className={`chip small ${family === f ? 'on' : ''}`} onClick={() => setFamily(f)}>{f}</button>
              ))}
            </div>
          )}
          <div className="group" style={{ background: 'var(--ground)' }}>
            {mine.map((m) => (
              <button key={m.id} className="group-row" style={{ border: 0 }} onClick={() => { const { id: _id, ...rest } = m; void _id; onPick(rest, false) }}>
                <span className="col" style={{ gap: 1, flex: 1 }}>
                  <span className="bold">{m.name}</span>
                  <span className="small muted">{m.family}, {m.minutes} דקות{m.equipment.length ? `, צריך ${m.equipment.join(', ')}` : ''}</span>
                  {m.purpose && <span className="small" style={{ color: 'var(--ink2)' }}>{m.purpose}</span>}
                </span>
                <Icon name="plus" size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'families' && (
        <div className="col" style={{ gap: 12 }}>
          {METHOD_FAMILIES.map((f) => (
            <div key={f.name} className="col" style={{ gap: 6 }}>
              <span className="bold">{f.name}</span>
              <div className="chips" style={{ gap: 6 }}>
                {f.examples.map((ex) => <button key={ex} className="chip small" onClick={() => onPick(blank(f.name, ex), true)}>{ex}</button>)}
                <button className="chip small" style={{ borderStyle: 'dashed' }} onClick={() => onPick(blank(f.name), true)}>אחרת</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// The activity as a clean page for printing or saving as PDF
export function ActivityPrint() {
  const { activities, partnerships } = useStore()
  const a = activities.find((x) => x.id === idFromHash())
  useEffect(() => {
    if (!a) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [a])
  if (!a) return <main className="screen"><p className="empty">הפעילות לא נמצאה.</p></main>
  const html = activityHtml(a, partnerships.find((p) => p.id === a.partnershipId)?.name)
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  return (
    <main className="print-page">
      <div className="row no-print" style={{ padding: 16, gap: 8 }}>
        <button className="btn" onClick={() => window.print()}>הדפסה או שמירה כ-PDF</button>
        <a className="btn light" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} href={`#/activity?id=${a.id}`}>חזרה</a>
      </div>
      <div dangerouslySetInnerHTML={{ __html: body }} />
      {a.date && <p className="no-print small muted" style={{ padding: 16 }}>{formatDay(a.date)}</p>}
    </main>
  )
}
