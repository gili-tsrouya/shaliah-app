import { useRef, useState } from 'react'
import { useStore, newId } from '../lib/store'
import { FREQUENCIES, GRADE_COLORS, daysUntilDue, freqLabel, gradeNow, scoreColor, sortByPriority, touchScore } from '../lib/derive'
import { agoText, daysBetween, inDaysText, israelTime, todayISO } from '../lib/dates'
import { Fab, SelfTabs, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Person } from '../lib/types'
import { parseVCards, pickContacts, pickerSupported, type ImportedContact } from '../lib/contacts'

// Shrinks a picked photo to a small square so it fits in phone storage
function resizePhoto(file: Blob) {
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
  const [imported, setImported] = useState<ImportedContact[] | null>(null)
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const today = todayISO()

  const startImport = async () => {
    setImportError('')
    if (!pickerSupported()) {
      fileInput.current?.click()
      return
    }
    try {
      const picked = await pickContacts()
      if (picked.length) setImported(picked)
    } catch {
      fileInput.current?.click()
    }
  }

  const readFile = async (file: File) => {
    const found = parseVCards(await file.text())
    if (found.length) setImported(found)
    else setImportError('לא מצאתי אנשי קשר בקובץ הזה. צריך קובץ .vcf מאפליקציית אנשי הקשר.')
  }
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

      <button className="btn light row" style={{ justifyContent: 'center', gap: 8 }} onClick={startImport}>
        <Icon name="contacts" size={18} /> הוספה מאנשי הקשר
      </button>
      <input ref={fileInput} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory" aria-label="קובץ אנשי קשר" style={{ display: 'none' }}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) readFile(file) }} />
      {importError && <p className="small" style={{ color: 'var(--danger)' }}>{importError}</p>}
      {!pickerSupported() && (
        <details className="muted small">
          <summary style={{ cursor: 'pointer' }}>איך מוציאים אנשי קשר מהאייפון?</summary>
          <ol style={{ margin: '8px 0 0', paddingInlineStart: 20, lineHeight: 1.6 }}>
            <li><b>איש קשר אחד:</b> באפליקציית אנשי הקשר פותחים את האדם ← "שיתוף איש קשר" ← "שמירה בקבצים".</li>
            <li><b>כמה ביחד:</b> באפליקציית אנשי הקשר עוברים ל"רשימות", לוחצים לחיצה ארוכה על רשימה ← "ייצוא" ← "שמירה בקבצים". אפשר לפתוח רשימה חדשה רק עם האנשים שרוצים.</li>
            <li>חוזרים לכאן, לוחצים "הוספה מאנשי הקשר" ובוחרים את הקובץ. תופיע רשימה ותבחרו את מי להוסיף.</li>
          </ol>
        </details>
      )}

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
                  <Icon name="phone" size={15} /> צ׳אט וואטסאפ
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

      {imported && <ImportSheet contacts={imported} people={people} onClose={() => setImported(null)}
        onAdd={(added) => setPeople((ps) => [...ps, ...added])} />}

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

const samePhone = (a?: string, b?: string) => !!a && !!b && digits(a).slice(-9) === digits(b).slice(-9)

function ImportSheet({ contacts, people, onClose, onAdd }: {
  contacts: ImportedContact[]; people: Person[]; onClose: () => void; onAdd: (ps: Person[]) => void
}) {
  const today = todayISO()
  const exists = (c: ImportedContact) => people.some((p) => p.name.trim() === c.name.trim() || samePhone(p.phone, c.phone))
  const [chosen, setChosen] = useState<boolean[]>(() => contacts.map((c) => !exists(c)))
  const [every, setEvery] = useState(7)
  const [saving, setSaving] = useState(false)
  const count = chosen.filter(Boolean).length

  const add = async () => {
    setSaving(true)
    const picked = contacts.filter((_, i) => chosen[i])
    const added: Person[] = []
    for (const c of picked) {
      let photo: string | undefined
      if (c.photo) {
        try { photo = await resizePhoto(c.photo) } catch { /* keep the person without a photo */ }
      }
      // Starting from today means nobody shows up as overdue the moment they are added
      added.push({ id: newId(), name: c.name, phone: c.phone, photo, everyDays: every, lastTalk: today })
    }
    onAdd(added)
    onClose()
  }

  return (
    <Sheet title="הוספה מאנשי הקשר" onClose={onClose}>
      <div className="between small">
        <span className="muted">{count} נבחרו מתוך {contacts.length}</span>
        <button className="chip small" onClick={() => setChosen(contacts.map((c) => (count === 0 ? !exists(c) : false)))}>
          {count === 0 ? 'בחר הכל' : 'נקה בחירה'}
        </button>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {contacts.map((c, i) => {
          const dup = exists(c)
          return (
            <label key={i} className="row" style={{ gap: 10, padding: '6px 4px', opacity: dup && !chosen[i] ? 0.55 : 1, cursor: 'pointer' }}>
              <input type="checkbox" checked={chosen[i]} style={{ width: 22, height: 22, flexShrink: 0 }}
                onChange={(e) => setChosen((ch) => ch.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                <span className="bold">{c.name}</span>
                <span className="muted small" dir={c.phone ? 'ltr' : undefined} style={{ alignSelf: 'flex-start' }}>{c.phone ?? 'אין מספר'}</span>
              </span>
              {dup && <span className="tag paid">כבר ברשימה</span>}
            </label>
          )
        })}
      </div>
      <label className="field">כל כמה זמן לדבר איתם?
        <select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
          {FREQUENCIES.map((f) => <option key={f.days} value={f.days}>{f.label}</option>)}
        </select>
      </label>
      <p className="muted small">אפשר לשנות לכל אחד בנפרד אחר כך, בלחיצה על התמונה שלו.</p>
      <button className="btn block" disabled={count === 0 || saving} onClick={add}>
        {saving ? 'מוסיף…' : count === 1 ? 'הוסף אדם אחד' : `הוסף ${count} אנשים`}
      </button>
    </Sheet>
  )
}
