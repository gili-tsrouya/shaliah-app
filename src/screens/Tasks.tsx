import { useState } from 'react'
import { useCategory, useStore, newId } from '../lib/store'
import { colorOf } from '../lib/derive'
import { daysBetween, formatDay, israelTime, todayISO } from '../lib/dates'
import type { Task } from '../lib/types'
import { TODAY_MAX, complete, doneOn, inboxTasks, laterTasks, makeFirst, planForToday, reopen, todayTasks, unplan } from '../lib/tasks'
import { Sheet } from '../components/ui'
import { Icon } from '../components/Icon'

// Write it down, then choose three. Capturing is one line; sorting happens later; today holds at most
// three tasks, and the first is the one to do before anything else.
export function Tasks() {
  const { tasks, setTasks, calCategories, events, setEvents } = useStore()
  const cat = useCategory()
  const today = todayISO()
  const [draft, setDraft] = useState('')
  const [full, setFull] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [showAllLater, setShowAllLater] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const chosen = todayTasks(tasks, today)
  const inbox = inboxTasks(tasks)
  const later = laterTasks(tasks, today)
  const done = doneOn(tasks, today)
  const allDone = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 20)

  const toToday = (id: string) => {
    const next = planForToday(tasks, id, today)
    if (!next) return setFull(true)
    setFull(false)
    setTasks(next)
  }
  const capture = (ev: React.FormEvent) => {
    ev.preventDefault()
    const title = draft.trim()
    if (!title) return
    setTasks((ts) => [...ts, { id: newId(), title, work: 'personal', status: 'todo', inbox: true }])
    setDraft('')
  }
  const dueText = (t: Task) => {
    if (!t.due) return ''
    const d = daysBetween(today, t.due)
    return d < 0 ? `באיחור, היה עד ${formatDay(t.due)}` : d === 0 ? 'עד היום' : d === 1 ? 'עד מחר' : `עד ${formatDay(t.due)}`
  }
  const block = (t: Task) => events.find((e) => e.id === t.blockEventId)
  const sub = (t: Task) => {
    const b = block(t)
    return [cat(t.work).label, b && b.date === today && b.start ? `שמרת לזה ${b.start}${b.end ? `–${b.end}` : ''} ביומן` : '', dueText(t), t.status === 'blocked' ? 'תקוע' : '']
      .filter(Boolean).join(', ')
  }
  const dot = (t: Task) => ({ background: colorOf(cat(t.work).color).dot })
  const laterShown = showAllLater ? later : later.slice(0, 6)

  return (
    <main className="screen">
      <div className="title-row" style={{ alignItems: 'baseline' }}>
        <h1>משימות</h1>
        {done.length > 0 && <span className="bold" style={{ color: 'var(--ink2)' }}>{done.length === 1 ? 'סיימת אחת היום' : `סיימת ${done.length} היום`}</span>}
      </div>

      <form onSubmit={capture} className="row" style={{ background: 'var(--surface)', borderRadius: 12, padding: 4, gap: 4 }}>
        <label htmlFor="capture" className="sr-only">משימה חדשה</label>
        <input id="capture" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="מה צריך לעשות? רק לכתוב, לסדר אחר כך"
          style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', padding: '0 12px', fontSize: 16 }} />
        <button type="submit" className="icon-btn solid" style={{ borderRadius: 10, width: 44, height: 44 }} aria-label="להוסיף"><Icon name="plus" size={20} stroke={2.4} /></button>
      </form>

      <section className="col" style={{ gap: 6 }}>
        <div className="section-head" style={{ padding: '0 4px' }}>
          <h2>היום</h2>
          <span className="small bold" style={{ color: 'var(--muted)' }}>{chosen.length} מתוך {TODAY_MAX}</span>
        </div>
        <div className="group">
          {chosen.map((t, i) => (
            <div key={t.id} className="group-row" style={{ minHeight: 64 }}>
              <button className="task-check" aria-label={`סימון "${t.title}" כבוצע`} onClick={() => setTasks((ts) => complete(ts, t.id, today))}><span /></button>
              <button className="task-title" onClick={() => setEditing(t)}>
                {i === 0 && <span className="frog">קודם כל זה</span>}
                <span style={{ fontSize: 17, fontWeight: 600 }}>{t.title}</span>
                <span className="row small" style={{ color: 'var(--muted)', gap: 6 }}><span className="dot8" style={dot(t)} />{sub(t)}</span>
              </button>
            </div>
          ))}
          {Array.from({ length: TODAY_MAX - chosen.length }, (_, k) => (
            <div key={`slot${k}`} className="group-row">
              <span className="task-slot" />
              <span className="muted">{chosen.length === 0 && k === 0 ? 'בחרי עד שלוש משימות להיום מהרשימה למטה' : 'מקום פנוי'}</span>
            </div>
          ))}
        </div>
        {full && <span className="small bold" style={{ color: 'var(--ink2)', padding: '0 4px' }}>היום מלא. שלוש זה מספיק, השאר יחכה למחר.</span>}
      </section>

      {inbox.length > 0 && (
        <section className="col" style={{ gap: 6 }}>
          <span className="section-label">רשמת ועוד לא סידרת</span>
          <div className="group">
            {inbox.map((t) => (
              <div key={t.id} className="group-row">
                <button className="task-title" onClick={() => setEditing(t)}><span style={{ fontSize: 16, fontWeight: 600 }}>{t.title}</span></button>
                <button className="chip small on" onClick={() => toToday(t.id)}>להיום</button>
                <button className="chip small" onClick={() => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, inbox: false } : x)))}>אחר כך</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="col" style={{ gap: 6 }}>
        <span className="section-label">בהמשך</span>
        {later.length === 0 && <p className="empty">אין משימות נוספות</p>}
        {later.length > 0 && (
          <div className="group">
            {laterShown.map((t) => (
              <div key={t.id} className="group-row">
                <span className="dot8" style={dot(t)} />
                <button className="task-title" onClick={() => setEditing(t)}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{t.title}</span>
                  <span className="small" style={{ color: t.due && daysBetween(today, t.due) < 0 ? 'var(--danger)' : 'var(--muted)' }}>{sub(t)}</span>
                </button>
                <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label={`להעביר את "${t.title}" להיום`} onClick={() => toToday(t.id)}><Icon name="up" size={18} /></button>
              </div>
            ))}
          </div>
        )}
        {later.length > 6 && (
          <button className="text-btn" onClick={() => setShowAllLater(!showAllLater)}>{showAllLater ? 'להציג פחות' : `ועוד ${later.length - 6} משימות`}</button>
        )}
      </section>

      {allDone.length > 0 && (
        <section className="col" style={{ gap: 6 }}>
          <button className="text-btn" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? 'להסתיר את מה שבוצע' : 'מה שבוצע'}</button>
          {showDone && (
            <div className="group">
              {allDone.map((t) => (
                <div key={t.id} className="group-row">
                  <Icon name="check" size={18} />
                  <span style={{ flex: 1, color: 'var(--muted)', textDecoration: 'line-through' }}>{t.title}</span>
                  <span className="small muted">{t.doneAt ? formatDay(t.doneAt) : ''}</span>
                  <button className="chip small" onClick={() => setTasks((ts) => reopen(ts, t.id))}>החזרה</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && (
        <TaskSheet task={editing} isToday={editing.plannedFor === today} isFirst={chosen[0]?.id === editing.id}
          categories={calCategories} block={block(editing)}
          onClose={() => setEditing(null)}
          onSave={(t, b) => {
            let blockId = t.blockEventId
            if (b) {
              const ev = { id: blockId ?? newId(), title: t.title, work: t.work, kind: 'event' as const, date: b.date, start: b.start, end: b.end }
              setEvents((es) => (es.some((e) => e.id === ev.id) ? es.map((e) => (e.id === ev.id ? { ...e, ...ev } : e)) : [...es, ev]))
              blockId = ev.id
            }
            setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...t, blockEventId: blockId } : x)))
            setEditing(null)
          }}
          onToday={() => { toToday(editing.id); setEditing(null) }}
          onUnplan={() => { setTasks((ts) => unplan(ts, editing.id)); setEditing(null) }}
          onFirst={() => { setTasks((ts) => makeFirst(ts, editing.id, today)); setEditing(null) }}
          onDelete={() => { setTasks((ts) => ts.filter((t) => t.id !== editing.id)); setEditing(null) }} />
      )}
    </main>
  )
}

function TaskSheet({ task, isToday, isFirst, categories, block, onClose, onSave, onToday, onUnplan, onFirst, onDelete }: {
  task: Task; isToday: boolean; isFirst: boolean; categories: { id: string; label: string }[]
  block?: { date: string; start?: string; end?: string }
  onClose: () => void; onSave: (t: Task, block?: { date: string; start: string; end: string }) => void
  onToday: () => void; onUnplan: () => void; onFirst: () => void; onDelete: () => void
}) {
  const [reserve, setReserve] = useState(!!block)
  const [start, setStart] = useState(block?.start ?? '')
  return (
    <Sheet title="משימה" onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        const s = (k: string) => String(f.get(k) || '') || undefined
        const next: Task = { ...task, title: String(f.get('title')), work: String(f.get('work')), due: s('due'), note: s('note'), inbox: false }
        const b = reserve && s('bstart') ? { date: s('bdate') ?? todayISO(), start: s('bstart')!, end: s('bend') ?? s('bstart')! } : undefined
        onSave(next, b)
      }}>
        <label className="field">מה צריך לעשות?<input name="title" defaultValue={task.title} required /></label>
        <div className="grid2">
          <label className="field">שייך ל
            <select name="work" defaultValue={task.work}>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </label>
          <label className="field">עד מתי<input name="due" type="date" defaultValue={task.due} /></label>
        </div>
        <label className="field">הערה<textarea name="note" rows={2} defaultValue={task.note} /></label>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#000' }} />
          <span className="bold">לשמור לזה זמן ביומן</span>
        </label>
        {reserve && (
          <div className="grid3">
            <label className="field">יום<input name="bdate" type="date" defaultValue={block?.date ?? todayISO()} /></label>
            <label className="field">משעה<input name="bstart" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="field">עד<input name="bend" type="time" defaultValue={block?.end} /></label>
          </div>
        )}
        {reserve && start && <span className="small muted">{start} כאן, {israelTime(start)} בישראל</span>}
        <button className="btn block" type="submit">שמירה</button>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {!isToday && <button type="button" className="btn light" onClick={onToday}>להיום</button>}
          {isToday && !isFirst && <button type="button" className="btn light" onClick={onFirst}>לעשות קודם</button>}
          {isToday && <button type="button" className="btn light" onClick={onUnplan}>להוריד מהיום</button>}
          <button type="button" className="btn danger" onClick={onDelete}>מחיקה</button>
        </div>
      </form>
    </Sheet>
  )
}
