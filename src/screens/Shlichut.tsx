import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { updatedText, useFeed } from '../lib/feeds'
import { Icon } from '../components/Icon'
import { NextRunNote } from '../components/NextRunNote'
import { Sheet } from '../components/ui'
import { COMMUNITIES, type FeedItem, type Partnership } from '../lib/types'

const audienceText = (p: Partnership) =>
  `${p.community.length ? `קהילה ${p.community.join(' / ')}` : 'נוער יהודי בתפוצות'}, גילאי ${p.ageFrom}–${p.ageTo}` +
  (p.notes ? ` (${p.notes})` : '')

// Opens ChatGPT with the request already typed in; Gili only presses send
const chatGptUrl = (i: FeedItem, idea: string | undefined, p: Partnership | undefined) =>
  'https://chatgpt.com/?q=' + encodeURIComponent(
    `כתוב לי פעילות בנושא: ${i.title}. הקהל: ${p ? audienceText(p) : 'נוער יהודי בתפוצות (גילאי 13–18)'}.` +
    (idea ? ` כיוון אפשרי: ${idea}.` : '') +
    ' התאם את התוכן והשפה לקהל הזה. כלול מטרות, פתיחה, משחק או דיון, שאלות לשיחה, סיכום, משך כולל של כשעה ורשימת ציוד.',
  )

const FILTERS = ['הכל', 'פרשת השבוע', 'חגים ומועדים', 'ישראל', 'העולם היהודי']

export function Shlichut() {
  const { feed, error } = useFeed('shlichut')
  const { setTasks, calCategories, partnerships, publishPartnerships } = useStore()
  const [filter, setFilter] = useState('הכל')
  const [forId, setForId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partnership | null>(null)
  const [made, setMade] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  const partner = partnerships.find((p) => p.id === forId)
  const all = feed?.items ?? []
  const tagged = all.some((i) => i.forPartnerships?.length)
  // Older feeds have no partnership tags yet; then show everything
  const fits = (i: FeedItem) => !partner || !tagged || !!i.forPartnerships?.some((f) => f.id === partner.id)
  const ideaFor = (i: FeedItem) => (partner && i.forPartnerships?.find((f) => f.id === partner.id)?.idea) || i.idea
  const featured = all.find((i) => i.category === 'פרשת השבוע' && fits(i))
  const items = all.filter((i) => i !== featured && fits(i) && (filter === 'הכל' || i.category === filter))

  // "מתאים ל: …" under every item, so it is clear which partnership each one is for
  const labels = (i: FeedItem, onBlue = false) => {
    if (!partnerships.length || !tagged) return null
    const fitsWhom = (i.forPartnerships ?? []).map((f) => partnerships.find((p) => p.id === f.id)).filter((p): p is Partnership => !!p)
    return (
      <span className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        <span className="small" style={{ color: onBlue ? '#DBE6FD' : 'var(--muted)' }}>מתאים ל:</span>
        {fitsWhom.length
          ? fitsWhom.map((p) => (
            <span key={p.id} className="tag" style={onBlue ? { background: '#fff', color: 'var(--primary)' } : { background: 'var(--tzofim-bg)', color: 'var(--tzofim-fg)' }}>{p.name}</span>
          ))
          : <span className="small" style={{ color: onBlue ? '#DBE6FD' : 'var(--muted)' }}>כללי</span>}
      </span>
    )
  }

  const makeTask = (i: FeedItem) => {
    const title = `הכנת פעילות: ${i.title}${partner ? ` (${partner.name})` : ''}`
    setTasks((ts) => [...ts, { id: newId(), title, work: calCategories[0]?.id ?? 'personal', status: 'todo', note: ideaFor(i) }])
    setMade((m) => [...m, i.id])
  }

  const savePartnerships = async (next: Partnership[]) => {
    try {
      const published = await publishPartnerships(next)
      setMsg(published ? 'נשמר. הסוכן יתאים את התוכן בעדכון של מחר בבוקר.' : 'נשמר בטלפון. כדי שהסוכן יקבל את זה, הוסיפו טוקן GitHub (גילויים בזול ← התאמה).')
    } catch {
      setMsg('נשמר בטלפון, אבל השמירה ב-GitHub נכשלה. בדקו את הטוקן.')
    }
  }

  return (
    <main className="screen">
      <header className="col" style={{ gap: 4 }}>
        <h1>שליחות</h1>
        <p className="muted">מה שווה לדבר עליו השבוע עם הנוער · {updatedText(feed?.updatedAt)}</p>
      </header>

      <section className="col" style={{ gap: 8 }}>
        <span className="small bold muted">השותפויות שלי</span>
        <div className="chips">
          <button className={`chip ${!forId ? 'on' : ''}`} aria-pressed={!forId} onClick={() => setForId(null)}>כל השותפויות</button>
          {partnerships.map((p) => (
            <button key={p.id} className={`chip ${forId === p.id ? 'on' : ''}`} aria-pressed={forId === p.id}
              onClick={() => setForId(forId === p.id ? null : p.id)} onContextMenu={(e) => { e.preventDefault(); setEditing(p) }}>{p.name}</button>
          ))}
          <button className="chip" style={{ borderStyle: 'dashed' }} onClick={() => setEditing({ id: '', name: '', community: [], ageFrom: 13, ageTo: 18 })}>+ שותפות</button>
        </div>
        {partner && (
          <button className="card row" style={{ flexDirection: 'row', textAlign: 'start', padding: '10px 14px' }} onClick={() => setEditing(partner)}>
            <span className="small" style={{ flex: 1 }}>{audienceText(partner)}</span>
            <Icon name="edit" size={16} />
          </button>
        )}
        {partnerships.length > 0 && !tagged && all.length > 0 && <p className="muted small">הסוכן עוד לא התאים את התוכן לשותפויות שלך, לכן אין עדיין תוויות. זה יקרה בעדכון של מחר בבוקר.</p>}
        {msg && <p className="small">{msg}</p>}
      </section>

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${f === filter ? 'on' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <NextRunNote />

      {error && <p className="empty">לא הצלחתי לטעון את התוכן. בדקו את החיבור לאינטרנט.</p>}
      {!error && feed && all.length === 0 && <p className="empty">עוד אין תוכן — הסוכן ימלא כאן ברגע שירוץ.</p>}

      {featured && (filter === 'הכל' || filter === 'פרשת השבוע') && (
        <article className="card blue" style={{ gap: 10 }}>
          <span className="small bold" style={{ color: '#DBE6FD' }}>{featured.category}{featured.when ? ` · ${featured.when}` : ''}</span>
          <h2 style={{ fontSize: 21, lineHeight: 1.3 }}>{featured.title}</h2>
          {ideaFor(featured) && <p style={{ fontSize: 14, lineHeight: 1.5, color: '#EEF3FE' }}>{ideaFor(featured)}</p>}
          {labels(featured, true)}
          <div className="row">
            <a className="btn white row" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', gap: 6 }} href={chatGptUrl(featured, ideaFor(featured), partner)} target="_blank" rel="noreferrer">
              <Icon name="sparkle" size={16} /> בנה פעילות ב-ChatGPT
            </a>
            <button className="icon-btn" style={{ borderRadius: 12, background: 'transparent', color: '#fff', borderColor: '#6F95E8' }}
              aria-label={made.includes(featured.id) ? 'נוספה משימה' : 'צור משימה להכנת פעילות'} disabled={made.includes(featured.id)} onClick={() => makeTask(featured)}>
              <Icon name={made.includes(featured.id) ? 'check' : 'board'} size={18} />
            </button>
          </div>
        </article>
      )}

      {items.map((i) => (
        <article key={i.id} className="card">
          <span className="muted small">{[i.category, i.when].filter(Boolean).join(' · ')}</span>
          <span className="bold" style={{ fontSize: 15 }}>{i.title}</span>
          {i.summary && <span style={{ fontSize: 14, color: '#3D4757', lineHeight: 1.45 }}>{i.summary}</span>}
          {ideaFor(i) && <span style={{ fontSize: 14, lineHeight: 1.45 }}><b>רעיון לשיחה{partner ? ` ל${partner.name}` : ''}: </b>{ideaFor(i)}</span>}
          {labels(i)}
          <div className="row">
            <a className="btn light row" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none', gap: 6, color: 'var(--primary)', fontWeight: 700 }} href={chatGptUrl(i, ideaFor(i), partner)} target="_blank" rel="noreferrer">
              <Icon name="sparkle" size={16} /> בנה פעילות ב-ChatGPT
            </a>
            <button className="btn light" disabled={made.includes(i.id)} onClick={() => makeTask(i)}>
              {made.includes(i.id) ? 'נוספה משימה' : 'צור משימה'}
            </button>
            {i.url && <a className="icon-btn" style={{ borderRadius: 10 }} href={i.url} target="_blank" rel="noreferrer" aria-label="למקור"><Icon name="link" size={18} /></a>}
          </div>
        </article>
      ))}

      {editing && <PartnershipSheet partnership={editing} onClose={() => setEditing(null)}
        onSave={(p) => savePartnerships(editing.id ? partnerships.map((x) => (x.id === p.id ? p : x)) : [...partnerships, { ...p, id: newId() }])}
        onDelete={() => { savePartnerships(partnerships.filter((x) => x.id !== editing.id)); if (forId === editing.id) setForId(null) }} />}
    </main>
  )
}

function PartnershipSheet({ partnership, onClose, onSave, onDelete }: {
  partnership: Partnership; onClose: () => void; onSave: (p: Partnership) => void; onDelete: () => void
}) {
  const [community, setCommunity] = useState(partnership.community)
  return (
    <Sheet title={partnership.id ? 'עריכת שותפות' : 'שותפות חדשה'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        const a = Number(f.get('ageFrom')) || 0
        const b = Number(f.get('ageTo')) || 0
        onSave({
          ...partnership, name: String(f.get('name')).trim(), community,
          ageFrom: Math.min(a, b), ageTo: Math.max(a, b), notes: String(f.get('notes') || '').trim() || undefined,
        })
        onClose()
      }}>
        <label className="field">שם השותפות (למשל: צופים שבט הדסון, בית כנסת רפורמי)
          <input name="name" defaultValue={partnership.name} required autoFocus={!partnership.id} />
        </label>
        <div className="field">סוג הקהילה (אפשר לבחור כמה)
          <div className="chips" style={{ gap: 6 }}>
            {COMMUNITIES.map((c) => {
              const on = community.includes(c)
              return <button type="button" key={c} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => setCommunity(on ? community.filter((x) => x !== c) : [...community, c])}>{c}</button>
            })}
          </div>
        </div>
        <div className="grid2">
          <label className="field">מגיל<input name="ageFrom" type="number" inputMode="numeric" min="5" max="99" defaultValue={partnership.ageFrom} required /></label>
          <label className="field">עד גיל<input name="ageTo" type="number" inputMode="numeric" min="5" max="99" defaultValue={partnership.ageTo} required /></label>
        </div>
        <label className="field">הערות לסוכן (לא חובה, למשל: רובם לא דוברי עברית, שומרי שבת)
          <input name="notes" defaultValue={partnership.notes} />
        </label>
        <p className="muted small">השם, סוג הקהילה והגילאים נשמרים בהגדרות הסוכן בריפו פרטי ב-GitHub (shaliah-data). בלי פרטים מזהים של בני נוער.</p>
        <button className="btn block" type="submit">שמור</button>
        {partnership.id && <button type="button" className="btn danger block" onClick={() => { onDelete(); onClose() }}>מחק שותפות</button>}
      </form>
    </Sheet>
  )
}
