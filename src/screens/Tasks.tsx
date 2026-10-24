import { useState } from 'react'
import { useCategory, useStore, newId } from '../lib/store'
import { colorOf } from '../lib/derive'
import { daysBetween, formatDay, todayISO } from '../lib/dates'
import { STATUSES, type Task, type TaskStatus } from '../lib/types'
import { Fab, Sheet } from '../components/ui'

const FLOW: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']
const NEXT: Partial<Record<TaskStatus, [TaskStatus, string]>> = { todo: ['doing', 'התחל'], doing: ['done', 'סיימתי'], blocked: ['doing', 'שוחרר — המשך'] }
const BACK: Partial<Record<TaskStatus, [TaskStatus, string]>> = { doing: ['blocked', 'סמן כחסום'], blocked: ['todo', 'החזר לרשימה'], done: ['doing', 'פתח מחדש'] }

export function Tasks() {
  const { tasks, setTasks, calCategories } = useStore()
  const cat = useCategory()
  const [col, setCol] = useState<TaskStatus>('todo')
  const [editing, setEditing] = useState<Task | null>(null)
  const today = todayISO()
  const move = (id: string, status: TaskStatus) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)))
  const shown = tasks.filter((t) => t.status === col).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  return (
    <main className="screen">
      <h1>משימות</h1>

      <div className="grid4" role="tablist">
        {FLOW.map((s) => {
          const on = s === col
          const n = tasks.filter((t) => t.status === s).length
          return (
            <button key={s} role="tab" aria-selected={on} onClick={() => setCol(s)} className="card"
              style={{ alignItems: 'center', gap: 2, padding: '10px 0', background: on ? 'var(--ink)' : undefined, color: on ? '#fff' : s === 'blocked' && n ? 'var(--danger)' : undefined, borderColor: on ? 'var(--ink)' : undefined }}>
              <span className="big-num" style={{ fontSize: 20 }}>{n}</span>
              <span className="small">{STATUSES[s]}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 && <p className="empty">אין כאן משימות</p>}

      {shown.map((t) => {
        const late = t.due && t.status !== 'done' ? daysBetween(today, t.due) : null
        return (
          <article key={t.id} className="card" style={{ gap: 10 }}>
            <div className="between">
              <span className="tag" style={{ background: colorOf(cat(t.work).color).bg, color: colorOf(cat(t.work).color).fg }}>{cat(t.work).label}</span>
              {t.due && <span className="small" style={{ color: late !== null && late <= 1 ? 'var(--danger)' : 'var(--muted)' }}>
                {late !== null && late < 0 ? 'באיחור · ' : ''}{late === 0 ? 'היום' : late === 1 ? 'מחר' : formatDay(t.due)}
              </span>}
            </div>
            <button style={{ all: 'unset', cursor: 'pointer', fontSize: 16, fontWeight: 700 }} onClick={() => setEditing(t)}>{t.title}</button>
            {t.note && <span className="small" style={t.status === 'blocked' ? { color: 'var(--danger)', background: '#FDECEC', borderRadius: 10, padding: '8px 10px' } : { color: 'var(--muted)' }}>{t.note}</span>}
            <div className="row">
              {BACK[t.status] && <button className="btn light" onClick={() => move(t.id, BACK[t.status]![0])}>{BACK[t.status]![1]}</button>}
              {NEXT[t.status] && <button className="btn" style={{ flex: 1 }} onClick={() => move(t.id, NEXT[t.status]![0])}>{NEXT[t.status]![1]}</button>}
            </div>
          </article>
        )
      })}

      <Fab label="משימה" onClick={() => setEditing({ id: '', title: '', work: calCategories[0]?.id ?? 'personal', status: col })} />

      {editing && (
        <Sheet title={editing.id ? 'עריכת משימה' : 'משימה חדשה'} onClose={() => setEditing(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const next: Task = {
              id: editing.id || newId(), title: String(f.get('title')), work: String(f.get('work')),
              status: f.get('status') as TaskStatus, due: String(f.get('due') || '') || undefined, note: String(f.get('note') || '') || undefined,
            }
            setTasks((ts) => (editing.id ? ts.map((t) => (t.id === editing.id ? next : t)) : [...ts, next]))
            setEditing(null)
          }}>
            <label className="field">מה צריך לעשות?<input name="title" defaultValue={editing.title} required autoFocus={!editing.id} /></label>
            <div className="grid2">
              <label className="field">שייך ל
                <select name="work" defaultValue={editing.work}>{calCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </label>
              <label className="field">סטטוס
                <select name="status" defaultValue={editing.status}>{FLOW.map((s) => <option key={s} value={s}>{STATUSES[s]}</option>)}</select>
              </label>
            </div>
            <label className="field">תאריך יעד<input name="due" type="date" defaultValue={editing.due} /></label>
            <label className="field">הערה (למשל: למה זה חסום)<textarea name="note" rows={2} defaultValue={editing.note} /></label>
            <button className="btn block" type="submit">שמור</button>
            {editing.id && <button type="button" className="btn danger block" onClick={() => { setTasks((ts) => ts.filter((t) => t.id !== editing.id)); setEditing(null) }}>מחק משימה</button>}
          </form>
        </Sheet>
      )}
    </main>
  )
}
