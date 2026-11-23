import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { newId } from '../lib/ids'
import { normalizePhone, parseVCards, pickContacts, pickerSupported, type ImportedContact } from '../lib/contacts'
import type { ImportantContact } from '../lib/types'
import { BackLink, Sheet } from '../components/ui'
import { Icon } from '../components/Icon'

// Work and emergency numbers: supervisor, safety officer, HR. Kept apart from "שומרים קשר",
// so they never get call reminders, rings or streaks.

const PLACES = [
  { id: 'tzofim', name: 'צופים', color: 'var(--tzofim-dot)' },
  { id: 'yj', name: 'Young Judaea', color: 'var(--yj-dot)' },
  { id: 'general', name: 'כללי', color: 'var(--muted)' },
] as const

const telOf = (phone: string) => phone.replace(/[^\d+]/g, '')
const waOf = (phone: string) => phone.replace(/\D/g, '')

type Draft = Omit<ImportantContact, 'id'> & { id?: string }
const blank = (): Draft => ({ role: '', name: '', phone: '', email: '', place: 'tzofim', note: '' })

export function ImportantContacts() {
  const { importantContacts: list, setImportantContacts: setList } = useStore()
  const [draft, setDraft] = useState<Draft | null>(null)

  return (
    <main className="screen">
      <BackLink href="#/self/contacts" label="שומרים קשר" />
      <div className="title-row">
        <h1>טלפונים חשובים</h1>
        <button className="icon-btn solid" aria-label="להוסיף טלפון" onClick={() => setDraft(blank())}><Icon name="plus" size={20} stroke={2.2} /></button>
      </div>
      <span className="muted" style={{ marginTop: -6 }}>אנשים שצריך להשיג מהר. בלי תזכורות ובלי רצפים.</span>

      <div className="group">
        <div className="group-row">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--danger)' }}>חירום</span>
            <span className="small muted">911 · משטרה, כיבוי, אמבולנס</span>
          </span>
          <a href="tel:911" className="emergency-call" aria-label="להתקשר ל-911"><Icon name="phone" size={18} />911</a>
        </div>
      </div>

      {list.length === 0 && <p className="empty">הוסיפי כאן את הרכזת, אחראי הבטיחות, משאבי אנוש וכל מי שצריך להשיג מהר</p>}

      {PLACES.map((pl) => {
        const people = list.filter((c) => c.place === pl.id)
        if (people.length === 0) return null
        return (
          <section key={pl.id} className="col" style={{ gap: 6 }}>
            <span className="section-label row" style={{ gap: 6 }}><span className="dot8" style={{ background: pl.color }} />{pl.name}</span>
            <div className="group">
              {people.map((c) => {
                const who = c.name || c.role
                return (
                  <div key={c.id} className="group-row" style={{ gap: 8 }}>
                    <button className="plain-row" onClick={() => setDraft({ ...c })} aria-label={`עריכת ${c.role}`}>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{c.role}</span>
                      {(c.name || c.note) && <span className="small muted">{[c.name, c.note].filter(Boolean).join(' · ')}</span>}
                    </button>
                    {c.email && <a className="round-btn" href={`mailto:${c.email}`} aria-label={`מייל ל${who}`}><Icon name="mail" size={20} /></a>}
                    {c.phone && <a className="round-btn" href={`https://wa.me/${waOf(c.phone)}`} target="_blank" rel="noreferrer" aria-label={`הודעה ל${who} בוואטסאפ`}><Icon name="message" size={20} /></a>}
                    {c.phone && <a className="round-btn solid" href={`tel:${telOf(c.phone)}`} aria-label={`להתקשר ל${who}`}><Icon name="phone" size={19} /></a>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {draft && (
        <ContactForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={(d) => {
            const clean: ImportantContact = {
              id: d.id ?? newId(), role: d.role.trim(), place: d.place,
              ...(d.name?.trim() ? { name: d.name.trim() } : {}),
              ...(d.phone?.trim() ? { phone: normalizePhone(d.phone.trim()) } : {}),
              ...(d.email?.trim() ? { email: d.email.trim() } : {}),
              ...(d.note?.trim() ? { note: d.note.trim() } : {}),
            }
            setList((l) => (d.id ? l.map((c) => (c.id === d.id ? clean : c)) : [...l, clean]))
            setDraft(null)
          }}
          onDelete={draft.id ? () => { setList((l) => l.filter((c) => c.id !== draft.id)); setDraft(null) } : undefined}
        />
      )}
    </main>
  )
}

function ContactForm({ draft, onClose, onSave, onDelete }: {
  draft: Draft; onClose: () => void; onSave: (d: Draft) => void; onDelete?: () => void
}) {
  const [d, setD] = useState(draft)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }))

  const fill = (c?: ImportedContact) => {
    if (!c) return
    setD((x) => ({ ...x, name: c.name || x.name, phone: c.phone || x.phone, email: c.email || x.email }))
    setError('')
  }
  const pick = async () => {
    if (!pickerSupported()) return fileInput.current?.click()
    try { fill((await pickContacts())[0]) } catch { setError('לא הצלחתי לפתוח את אנשי הקשר') }
  }

  return (
    <Sheet title={draft.id ? 'עריכת טלפון' : 'טלפון חדש'} onClose={onClose}>
      <form className="col" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (d.role.trim()) onSave(d) }}>
        <button type="button" className="btn light" onClick={pick}><Icon name="contacts" size={18} /> בחירה מאנשי הקשר בטלפון</button>
        <input ref={fileInput} type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory" aria-label="קובץ איש קשר" style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = ''
            if (!file) return
            const found = parseVCards(await file.text())
            if (found.length === 0) setError('לא מצאתי איש קשר בקובץ')
            else fill(found[0])
          }} />
        {!pickerSupported() && <span className="small muted">באייפון: באנשי הקשר פותחים את האדם ← "שיתוף איש קשר" ← "שמירה בקבצים", ואז בוחרים כאן את הקובץ.</span>}
        {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}

        <label className="field">תפקיד
          <input value={d.role} onChange={set('role')} placeholder="למשל אחראי בטיחות" required />
        </label>
        <label className="field">שם
          <input value={d.name ?? ''} onChange={set('name')} />
        </label>
        <div className="two-fields">
          <label className="field">טלפון
            <input type="tel" dir="ltr" inputMode="tel" value={d.phone ?? ''} onChange={set('phone')} placeholder="+1 …" style={{ textAlign: 'right' }} />
          </label>
          <label className="field">מייל (לא חובה)
            <input type="email" dir="ltr" value={d.email ?? ''} onChange={set('email')} placeholder="name@…" style={{ textAlign: 'right' }} />
          </label>
        </div>
        <label className="field">הערה (לא חובה)
          <input value={d.note ?? ''} onChange={set('note')} placeholder="למשל רק בשעות העבודה" />
        </label>
        <div className="row" role="radiogroup" aria-label="מקום עבודה" style={{ gap: 8 }}>
          {PLACES.map((pl) => (
            <button key={pl.id} type="button" role="radio" aria-checked={d.place === pl.id}
              className={`chip ${d.place === pl.id ? 'on' : ''}`} style={{ flex: 1, justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', padding: '0 8px', fontSize: 14 }}
              onClick={() => setD((x) => ({ ...x, place: pl.id }))}>
              <span className="dot8" style={{ background: pl.color }} />{pl.name}
            </button>
          ))}
        </div>
        <button type="submit" className="btn" disabled={!d.role.trim()}>שמירה</button>
        {onDelete && <button type="button" className="btn light" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm('למחוק את הטלפון?')) onDelete() }}>מחיקה</button>}
      </form>
    </Sheet>
  )
}
