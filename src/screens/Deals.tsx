import { useCallback, useEffect, useState } from 'react'
import { useStore, newId } from '../lib/store'
import { updatedText, useFeed } from '../lib/feeds'
import { milesBetween } from '../lib/derive'
import { loadAgentSettings, saveAgentSettings } from '../lib/github'
import { SelfTabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { DealsMap } from '../components/DealsMap'
import { DEAL_TOPICS, type AgentSettings, type FeedItem } from '../lib/types'

const FILTERS = ['הכל', 'חינם', 'אוכל', 'יציאות', 'מבצעים', 'שמורים']
const RANGES: [number, string][] = [[5, '5 מייל'], [10, '10 מייל'], [25, '25 מייל'], [99, 'כולל ניו יורק']]
const PRICES: [number, string][] = [[0, 'רק חינם'], [10, 'עד $10'], [25, 'עד $25'], [999, 'לא משנה']]

const isFree = (d: FeedItem) => d.priceValue === 0 || d.price === 'חינם'

export function Deals() {
  const { feed, error } = useFeed('deals')
  const { savedDeals, setSavedDeals, setEvents, calCategories, agentSettings } = useStore()
  const [filter, setFilter] = useState('הכל')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [selected, setSelected] = useState<string | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const a = agentSettings

  const items = (feed?.items ?? []).filter((d) => {
    // The agent already searches by these settings; this hides older finds that no longer fit them
    if (a.maxPrice < 999 && d.priceValue != null && d.priceValue > a.maxPrice) return false
    if (a.rangeMiles < 99 && d.lat != null && d.lng != null && milesBetween(a, { lat: d.lat, lng: d.lng }) > a.rangeMiles) return false
    if (filter === 'הכל') return true
    if (filter === 'שמורים') return savedDeals.includes(d.id)
    if (filter === 'חינם') return isFree(d)
    return d.category === filter
  })
  const sel = items.find((d) => d.id === selected) ?? items.find((d) => d.lat != null)
  const onSelect = useCallback((id: string) => setSelected(id), [])

  const toggleSave = (id: string) =>
    setSavedDeals((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const addToCalendar = (d: FeedItem) => {
    if (!d.date) return
    const work = calCategories.find((c) => c.id === 'personal')?.id ?? calCategories[0]?.id ?? 'personal'
    setEvents((ev) => [...ev, { id: newId(), title: d.title, work, kind: 'event', date: d.date! }])
    setAdded((x) => [...x, d.id])
  }

  const rangeLabel = RANGES.find((r) => r[0] === a.rangeMiles)?.[1] ?? `${a.rangeMiles} מייל`
  const priceLabel = PRICES.find((p) => p[0] === a.maxPrice)?.[1] ?? `עד $${a.maxPrice}`

  const card = (d: FeedItem) => (
    <article key={d.id} className="card">
      <div className="between">
        <span className="muted small">{[d.category, d.when].filter(Boolean).join(' · ')}</span>
        {d.price && <span className={`tag ${isFree(d) ? 'free' : 'paid'}`}>{d.price}</span>}
      </div>
      <span className="bold" style={{ fontSize: 16 }}>{d.title}</span>
      {d.summary && <span className="muted">{d.summary}</span>}
      {d.where && <span className="muted">{d.where}</span>}
      <div className="row">
        {d.date && (
          <button className="btn" style={{ flex: 1 }} disabled={added.includes(d.id)} onClick={() => addToCalendar(d)}>
            {added.includes(d.id) ? 'נוסף ליומן' : 'הוסף ליומן'}
          </button>
        )}
        {d.lat != null && d.lng != null && (
          <a className="btn light row" style={{ textDecoration: 'none', justifyContent: 'center' }}
            href={`https://maps.apple.com/?daddr=${d.lat},${d.lng}`} target="_blank" rel="noreferrer">ניווט</a>
        )}
        {d.url && <a className="btn light row" style={{ textDecoration: 'none', flex: d.date ? undefined : 1, justifyContent: 'center' }} href={d.url} target="_blank" rel="noreferrer">לפרטים</a>}
        <button className={`icon-btn ${savedDeals.includes(d.id) ? 'solid' : ''}`} style={{ borderRadius: 10 }}
          aria-label={savedDeals.includes(d.id) ? 'הסר משמורים' : 'שמור'} aria-pressed={savedDeals.includes(d.id)}
          onClick={() => toggleSave(d.id)}>
          <Icon name="bookmark" size={18} />
        </button>
      </div>
    </article>
  )

  return (
    <main className="screen">
      <h1>לעצמי</h1>
      <SelfTabs active="deals" />

      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <span className="avatar" style={{ width: 32, height: 32, background: 'var(--personal-bg)', color: 'var(--personal-fg)' }}><Icon name="search" size={18} /></span>
        <div className="col" style={{ gap: 0, flex: 1 }}>
          <span className="bold" style={{ fontSize: 14 }}>הסוכן סורק בשבילך כל בוקר</span>
          <span className="muted small">{rangeLabel} · {priceLabel} · {a.topics.length} נושאים · {updatedText(feed?.updatedAt)}</span>
        </div>
        <button className="chip small" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>
          <Icon name="sliders" size={16} /> התאמה
        </button>
      </div>

      {showSettings && <AgentSettingsPanel onDone={() => setShowSettings(false)} />}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="chips" style={{ flex: 1 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${f === filter ? 'on' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <div role="group" aria-label="תצוגה" className="row" style={{ background: 'var(--track)', borderRadius: 10, padding: 3, gap: 2 }}>
          {(['list', 'map'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} aria-label={v === 'list' ? 'תצוגת רשימה' : 'תצוגת מפה'} onClick={() => setView(v)}
              style={{ width: 40, height: 34, borderRadius: 8, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: view === v ? '#fff' : 'transparent', color: view === v ? 'var(--ink)' : 'var(--muted)' }}>
              <Icon name={v} size={18} />
            </button>
          ))}
        </div>
      </div>

      {error && <p className="empty">לא הצלחתי לטעון את הגילויים. בדקו את החיבור לאינטרנט.</p>}
      {!error && feed && items.length === 0 && (
        <p className="empty">{feed.items.length === 0 ? 'עוד אין גילויים — הסוכן ימלא כאן ברגע שירוץ.' : 'אין גילויים בסינון הזה'}</p>
      )}

      {view === 'map' ? (
        <>
          <DealsMap home={a} rangeMiles={a.rangeMiles} items={items} selected={sel?.id ?? null} onSelect={onSelect} />
          {items.some((d) => d.lat == null) && <p className="muted small">לחלק מהגילויים אין מיקום, הם מופיעים רק ברשימה.</p>}
          {sel && card(sel)}
        </>
      ) : items.map(card)}
    </main>
  )
}

function AgentSettingsPanel({ onDone }: { onDone: () => void }) {
  const { agentSettings, setAgentSettings, settings, setSettings } = useStore()
  const [draft, setDraft] = useState<AgentSettings>(agentSettings)
  const [status, setStatus] = useState('')
  const set = (patch: Partial<AgentSettings>) => setDraft((d) => ({ ...d, ...patch }))

  // Start from what the agent actually uses
  useEffect(() => {
    loadAgentSettings().then((s) => s && setDraft((d) => (JSON.stringify(d) === JSON.stringify(agentSettings) ? s : d)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => set({ lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) }),
    () => setStatus('לא קיבלתי הרשאת מיקום.'),
  )

  const save = async () => {
    const next = { ...draft, updatedAt: new Date().toISOString() }
    setAgentSettings(next)
    if (!settings.githubToken) {
      setStatus('נשמר בטלפון. כדי שהסוכן יקבל את ההגדרות, הוסיפו למטה טוקן של GitHub.')
      return
    }
    setStatus('שומר…')
    try {
      await saveAgentSettings(settings.githubToken, next)
      setStatus('')
      onDone()
    } catch (e) {
      setStatus('השמירה ב-GitHub נכשלה (' + (e as Error).message + '). בדקו את הטוקן.')
    }
  }

  const pills = <T,>(opts: [T, string][], value: T, onPick: (v: T) => void) => (
    <div className="chips" style={{ gap: 6 }}>
      {opts.map(([v, l]) => (
        <button key={l} className={`chip small ${value === v ? 'on' : ''}`} aria-pressed={value === v} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  )

  return (
    <section className="card" style={{ gap: 12 }}>
      <div className="field">מאיפה למדוד מרחק
        <div className="row">
          <input value={draft.home} onChange={(e) => set({ home: e.target.value })} placeholder="עיר או כתובת" style={{ flex: 1 }} />
          <button className="chip small" onClick={locate}>המיקום שלי</button>
        </div>
      </div>
      <div className="field">מרחק מהבית{pills(RANGES, draft.rangeMiles, (v) => set({ rangeMiles: v }))}</div>
      <div className="field">מחיר מקסימלי{pills(PRICES, draft.maxPrice, (v) => set({ maxPrice: v }))}</div>
      <div className="field">מה לחפש
        <div className="chips" style={{ gap: 6 }}>
          {DEAL_TOPICS.map((t) => {
            const on = draft.topics.includes(t.id)
            return <button key={t.id} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on}
              onClick={() => set({ topics: on ? draft.topics.filter((x) => x !== t.id) : [...draft.topics, t.id] })}>{t.label}</button>
          })}
        </div>
      </div>
      <label className="field">משהו נוסף? (למשל: יוגה בחינם, שוקי פשפשים)
        <input value={draft.extra} onChange={(e) => set({ extra: e.target.value })} placeholder="כתבו כאן…" />
      </label>
      <button className="btn block" onClick={save}>שמור — הסוכן יחפש לפי זה מחר בבוקר</button>
      {status && <p className="small" style={{ color: status.startsWith('נשמר') ? 'var(--muted)' : 'var(--danger)' }}>{status}</p>}
      <details>
        <summary className="small muted" style={{ cursor: 'pointer' }}>חיבור ל-GitHub (פעם אחת)</summary>
        <label className="field" style={{ marginTop: 8 }}>טוקן GitHub (fine-grained, רק לריפו shaliah-app, הרשאת Contents)
          <input type="password" dir="ltr" defaultValue={settings.githubToken} autoComplete="off"
            onBlur={(e) => setSettings((s) => ({ ...s, githubToken: e.target.value.trim() || undefined }))} />
        </label>
      </details>
    </section>
  )
}
