import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { FREQUENCIES, GRADE_COLORS, daysUntilDue, freqLabel, gradeNow, scoreColor, sortByPriority, touchScore } from '../lib/derive'
import { agoText, daysBetween, inDaysText, israelTime, todayISO } from '../lib/dates'
import { Fab, SelfTabs, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Person } from '../lib/types'

// Shrinks a picked photo to a small square so it fits in phone storage
function resizePhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = 160
      const c = document.createElement('canvas')
      c.width = c.height = size
      const side = Math.min(img.width, img.height)
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '')

export function Contacts() {
  const { people, setPeople, settings, setSettings } = useStore()
  const [editing, setEditing] = useState<Person | null>(null)
  const today = todayISO()
  const sorted = sortByPriority(people, today)
  const due = sorted.filter((p) => daysUntilDue(p) <= 0)

  const talked = (id: string) =>
    setPeople((ps) => ps.map((p) => (p.id === id && p.lastTalk !== today
      ? { ...p, lastTalk: today, history: [...(p.history ?? []), gradeNow(p, today)].slice(-8) }
      : p)))

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

      <div className="row small muted" style={{ flexWrap: 'wrap', gap: 12 }}>
        <span className="bold">כל נקודה = שיחה:</span>
        <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: GRADE_COLORS.g }} />בזמן</span>
        <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: GRADE_COLORS.y }} />קצת באיחור</span>
        <span className="row" style={{ gap: 4 }}><span className="dot" style={{ background: GRADE_COLORS.r }} />באיחור גדול</span>
      </div>

      {sorted.length === 0 && <p className="empty">הוסיפו את האנשים שחשוב לכם לשמור איתם על קשר</p>}

      {sorted.map((p) => {
        const left = daysUntilDue(p, today)
        const score = touchScore(p.history)
        const status = left < 0 ? `באיחור של ${inDaysText(-left)}` : left === 0 ? 'תזכורת: היום' : `התזכורת הבאה בעוד ${inDaysText(left)}`
        const color = left < 0 ? 'var(--danger)' : left === 0 ? 'var(--warn)' : 'var(--ok)'
        const tel = p.phone && digits(p.phone)
        return (
          <article key={p.id} className="card" style={{ gap: 10, padding: '12px 14px' }}>
            <div className="row" style={{ gap: 12 }}>
              <button aria-label={`עריכת ${p.name}`} onClick={() => setEditing(p)}
                style={{ width: 56, height: 56, borderRadius: 28, padding: 0, flexShrink: 0, background: '#fff', border: `3px solid ${scoreColor(score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {p.photo
                  ? <img src={p.photo} alt="" style={{ width: 46, height: 46, borderRadius: 23, objectFit: 'cover' }} />
                  : <span className="avatar" style={{ width: 46, height: 46 }}>{p.name.replace(/[^\p{L}]/gu, '').charAt(0)}</span>}
              </button>
              <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span className="bold" style={{ fontSize: 16 }}>{p.name}</span>
                <span className="muted small">{freqLabel(p.everyDays)} · דיברנו {agoText(daysBetween(p.lastTalk, today))}</span>
                {p.history?.length ? (
                  <span className="row" style={{ gap: 4, padding: '2px 0' }} role="img"
                    aria-label={`היסטוריית קשר: ${p.history.filter((g) => g === 'g').length} מתוך ${p.history.length} שיחות בזמן`}>
                    {p.history.map((g, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: GRADE_COLORS[g] }} />)}
                    <span className="muted" style={{ fontSize: 11, marginInlineStart: 4 }}>← עכשיו</span>
                  </span>
                ) : null}
                <span className="small bold" style={{ color }}>{status}{p.history?.length ? ` · ${score}% בזמן` : ''}</span>
              </div>
              <button className={`icon-btn ${left <= 0 ? 'solid' : ''}`} aria-label={`דיברתי עם ${p.name}`} onClick={() => talked(p.id)}>
                <Icon name="check" size={20} stroke={2.5} />
              </button>
            </div>
            {tel ? (
              <div className="grid3" style={{ gap: 6 }}>
                <a className="btn light row" style={{ justifyContent: 'center', gap: 5, minHeight: 38, fontSize: 13, background: '#DCF8E6', color: '#0B5B2E', border: 'none', textDecoration: 'none', fontWeight: 700 }}
                  href={`https://wa.me/${tel.replace('+', '')}`} target="_blank" rel="noreferrer" onClick={() => talked(p.id)}>
                  <Icon name="phone" size={15} /> וואטסאפ
                </a>
                <a className="btn light row" style={{ justifyContent: 'center', gap: 5, minHeight: 38, fontSize: 13, background: '#E3EDFD', color: '#1E3A8A', border: 'none', textDecoration: 'none', fontWeight: 700 }}
                  href={`facetime:${tel}`} onClick={() => talked(p.id)}>
                  <Icon name="video" size={15} /> FaceTime
                </a>
                <a className="btn light row" style={{ justifyContent: 'center', gap: 5, minHeight: 38, fontSize: 13, background: '#E3EDFD', color: '#1E3A8A', border: 'none', textDecoration: 'none', fontWeight: 700 }}
                  href={`facetime-audio:${tel}`} onClick={() => talked(p.id)}>
                  <Icon name="phone" size={15} /> שיחת FaceTime
                </a>
              </div>
            ) : (
              <button className="chip small" style={{ alignSelf: 'flex-start', borderStyle: 'dashed', color: 'var(--muted)' }} onClick={() => setEditing(p)}>
                + הוספת מספר טלפון (לא חובה)
              </button>
            )}
          </article>
        )
      })}

      <Fab label="אדם" onClick={() => setEditing({ id: '', name: '', everyDays: 7, lastTalk: today })} />

      {editing && <PersonSheet person={editing} today={today} onClose={() => setEditing(null)}
        onSave={(next) => setPeople((ps) => (editing.id ? ps.map((p) => (p.id === editing.id ? next : p)) : [...ps, { ...next, id: newId() }]))}
        onDelete={() => setPeople((ps) => ps.filter((p) => p.id !== editing.id))} />}
    </main>
  )
}

function PersonSheet({ person, today, onClose, onSave, onDelete }: {
  person: Person; today: string; onClose: () => void; onSave: (p: Person) => void; onDelete: () => void
}) {
  const [photo, setPhoto] = useState(person.photo)
  return (
    <Sheet title={person.id ? 'עריכה' : 'אדם חדש'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        onSave({
          ...person, name: String(f.get('name')), everyDays: Number(f.get('every')), lastTalk: String(f.get('last')),
          phone: String(f.get('phone') || '').trim() || undefined, photo,
        })
        onClose()
      }}>
        <div className="row" style={{ gap: 12 }}>
          <label style={{ width: 72, height: 72, borderRadius: 36, background: 'var(--ground)', border: '1px dashed #B9C2D3', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', flexShrink: 0 }}>
            {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="camera" size={24} />}
            <input type="file" accept="image/*" aria-label="תמונת פרופיל" style={{ display: 'none' }}
              onChange={async (e) => { const file = e.target.files?.[0]; if (file) setPhoto(await resizePhoto(file)) }} />
          </label>
          <span className="muted small" style={{ flex: 1 }}>לחצו על העיגול כדי להוסיף תמונה</span>
          {photo && <button type="button" className="chip small" onClick={() => setPhoto(undefined)}>הסר תמונה</button>}
        </div>
        <label className="field">שם<input name="name" defaultValue={person.name} required autoFocus={!person.id} /></label>
        <label className="field">כל כמה זמן לדבר?
          <select name="every" defaultValue={person.everyDays}>
            {FREQUENCIES.map((f) => <option key={f.days} value={f.days}>{f.label}</option>)}
          </select>
        </label>
        <label className="field">טלפון (לא חובה, עם קידומת מדינה, למשל +972…)
          <input name="phone" type="tel" dir="ltr" defaultValue={person.phone} placeholder="+972 50 123 4567" />
        </label>
        <label className="field">מתי דיברנו לאחרונה?<input name="last" type="date" defaultValue={person.lastTalk} max={today} required /></label>
        <button className="btn block" type="submit">שמור</button>
        {person.id && <button type="button" className="btn danger block" onClick={() => { onDelete(); onClose() }}>הסר מהרשימה</button>}
      </form>
    </Sheet>
  )
}
