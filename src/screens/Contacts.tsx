import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { FREQUENCIES, daysUntilDue, freqLabel, sortByDue } from '../lib/derive'
import { agoText, daysBetween, inDaysText, israelTime, todayISO } from '../lib/dates'
import { Fab, SelfTabs, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Person } from '../lib/types'

export function Contacts() {
  const { people, setPeople, settings, setSettings } = useStore()
  const [editing, setEditing] = useState<Person | null>(null)
  const today = todayISO()
  const sorted = sortByDue(people)
  const due = sorted.filter((p) => daysUntilDue(p) <= 0)

  const talked = (id: string) => setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, lastTalk: today } : p)))

  return (
    <main className="screen">
      <h1>לעצמי</h1>
      <SelfTabs active="contacts" />

      <div className="card dark" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16 }}>
        <span className="avatar" style={{ background: '#2A3A55', color: '#fff', width: 40, height: 40 }}><Icon name="bell" size={20} /></span>
        <div className="col" style={{ gap: 2, flex: 1 }}>
          <span className="bold" style={{ fontSize: 15 }}>{due.length ? `היום כדאי לדבר עם: ${due.map((p) => p.name).join(', ')}` : 'דיברת עם כולם, כל הכבוד'}</span>
          <label className="small" style={{ color: '#C9D2E3', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            תזכורת יומית:
            <input type="time" value={settings.reminderTime} aria-label="שעת תזכורת"
              onChange={(e) => setSettings((s) => ({ ...s, reminderTime: e.target.value || '12:00' }))}
              style={{ background: 'transparent', border: '1px solid #3A4A66', borderRadius: 6, color: '#fff', padding: '0 4px' }} />
            <span>· {israelTime(settings.reminderTime)} בישראל</span>
          </label>
        </div>
      </div>

      {sorted.length === 0 && <p className="empty">הוסיפו את האנשים שחשוב לכם לשמור איתם על קשר</p>}

      {sorted.map((p) => {
        const left = daysUntilDue(p, today)
        const status = left < 0 ? `באיחור של ${inDaysText(-left)}` : left === 0 ? 'תזכורת: היום' : `התזכורת הבאה בעוד ${inDaysText(left)}`
        const color = left < 0 ? 'var(--danger)' : left === 0 ? 'var(--warn)' : 'var(--ok)'
        return (
          <article key={p.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
            <button className="avatar" style={{ border: 'none' }} aria-label={`עריכת ${p.name}`} onClick={() => setEditing(p)}>
              {p.name.replace(/[^\p{L}]/gu, '').charAt(0)}
            </button>
            <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <span className="bold" style={{ fontSize: 16 }}>{p.name}</span>
              <span className="muted small">{freqLabel(p.everyDays)} · דיברנו {agoText(daysBetween(p.lastTalk, today))}</span>
              <span className="small bold" style={{ color }}>{status}</span>
            </div>
            <button className={`icon-btn ${left <= 0 ? 'solid' : ''}`} aria-label={`דיברתי עם ${p.name}`} onClick={() => talked(p.id)}>
              <Icon name="check" size={20} stroke={2.5} />
            </button>
          </article>
        )
      })}

      <Fab label="אדם" onClick={() => setEditing({ id: '', name: '', everyDays: 7, lastTalk: today })} />

      {editing && (
        <Sheet title={editing.id ? 'עריכה' : 'אדם חדש'} onClose={() => setEditing(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const next: Person = { id: editing.id || newId(), name: String(f.get('name')), everyDays: Number(f.get('every')), lastTalk: String(f.get('last')) }
            setPeople((ps) => (editing.id ? ps.map((p) => (p.id === editing.id ? next : p)) : [...ps, next]))
            setEditing(null)
          }}>
            <label className="field">שם<input name="name" defaultValue={editing.name} required autoFocus={!editing.id} /></label>
            <label className="field">כל כמה זמן לדבר?
              <select name="every" defaultValue={editing.everyDays}>
                {FREQUENCIES.map((f) => <option key={f.days} value={f.days}>{f.label}</option>)}
              </select>
            </label>
            <label className="field">מתי דיברנו לאחרונה?<input name="last" type="date" defaultValue={editing.lastTalk} max={today} required /></label>
            <button className="btn block" type="submit">שמור</button>
            {editing.id && (
              <button type="button" className="btn danger block" onClick={() => {
                setPeople((ps) => ps.filter((p) => p.id !== editing.id))
                setEditing(null)
              }}>הסר מהרשימה</button>
            )}
          </form>
        </Sheet>
      )}
    </main>
  )
}
