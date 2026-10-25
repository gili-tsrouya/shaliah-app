import { useCallback, useEffect, useState } from 'react'
import { useStore, newId } from '../lib/store'
import { updatedText, useFeed } from '../lib/feeds'
import { inNyc, milesBetween, rangeOf } from '../lib/derive'
import { loadAgentSettings } from '../lib/github'
import { currentPlace, isAway } from '../lib/places'
import { formatDay, todayISO, addDays } from '../lib/dates'
import { SelfTabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { DealsMap } from '../components/DealsMap'
import { PlacePicker } from '../components/PlacePicker'
import { NextRunNote } from '../components/NextRunNote'
import { DEAL_TOPICS, type AgentSettings, type FeedItem } from '../lib/types'

const FILTERS = ['הכל', 'חינם', 'אוכל', 'יציאות', 'מבצעים', 'שמורים']
const RANGES: [number, string][] = [[5, '5 מייל'], [10, '10 מייל'], [25, '25 מייל']]
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
  const here = currentPlace(a)
  const today = todayISO()

  const range = rangeOf(a)
  const items = (feed?.items ?? []).filter((d) => {
    // Never show something that already happened, whatever the agent wrote
    if (d.date && d.date < today) return false
    // The agent already searches by these settings; this hides older finds that no longer fit them
    if (a.maxPrice < 999 && d.priceValue != null && d.priceValue > a.maxPrice) return false
    if (d.lat != null && d.lng != null) {
      const p = { lat: d.lat, lng: d.lng }
      if (milesBetween(here, p) > range.miles && !(range.nyc && inNyc(p))) return false
    }
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

  const rangeLabel = `${range.miles} מייל${range.nyc ? ' + ניו יורק' : ''}`
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
          <span className="muted small">{isAway(a) ? `${here.name} עד ${formatDay(a.awayUntil!)} · ` : ''}{rangeLabel} · {priceLabel} · {a.topics.length} נושאים · {updatedText(feed?.updatedAt)}</span>
        </div>
        <button className="chip small" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>
          <Icon name="sliders" size={16} /> התאמה
        </button>
      </div>

      {showSettings && <AgentSettingsPanel onDone={() => setShowSettings(false)} />}
      <NextRunNote />

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
          <DealsMap home={here} rangeMiles={range.miles} items={items} selected={sel?.id ?? null} onSelect={onSelect} />
          {items.some((d) => d.lat == null) && <p className="muted small">לחלק מהגילויים אין מיקום, הם מופיעים רק ברשימה.</p>}
          {sel && card(sel)}
        </>
      ) : items.map(card)}
    </main>
  )
}

function AgentSettingsPanel({ onDone }: { onDone: () => void }) {
  const { agentSettings, publishAgentSettings, settings, setSettings, profile } = useStore()
  const [draft, setDraft] = useState<AgentSettings>(agentSettings)
  const [status, setStatus] = useState('')
  const set = (patch: Partial<AgentSettings>) => setDraft((d) => ({ ...d, ...patch }))

  // Start from what the agent actually uses
  useEffect(() => {
    loadAgentSettings().then((s) => s && setDraft((d) => (JSON.stringify(d) === JSON.stringify(agentSettings) ? s : d)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const home = draft.homeBase ?? profile.home
  const away = isAway(draft)
  const goHome = () => set({ home: home.name, lat: home.lat, lng: home.lng, awayUntil: undefined })

  const save = async () => {
    setStatus('שומר…')
    try {
      if (!(await publishAgentSettings({ ...draft, homeBase: home }))) {
        setStatus('נשמר בטלפון. כדי שהסוכן יקבל את ההגדרות, הוסיפו למטה טוקן של GitHub.')
        return
      }
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
      <div className="field">איפה לחפש
        <div className="chips" style={{ gap: 6 }}>
          <button className={`chip small ${!away ? 'on' : ''}`} aria-pressed={!away} onClick={goHome}>בבית ({home.name})</button>
          <button className={`chip small ${away ? 'on' : ''}`} aria-pressed={away}
            onClick={() => !away && set({ awayUntil: addDays(todayISO(), 7) })}>במקום אחר זמנית (חופשה, נסיעה)</button>
        </div>
      </div>
      {away && (
        <>
          <PlacePicker label="איפה אני" value={{ name: draft.home, lat: draft.lat, lng: draft.lng }}
            onPick={(p) => set({ home: p.name, lat: p.lat, lng: p.lng })} />
          <label className="field">עד מתי? (אחרי התאריך הזה הסוכן חוזר לחפש ליד הבית)
            <input type="date" value={draft.awayUntil} min={todayISO()} onChange={(e) => set({ awayUntil: e.target.value || undefined })} />
          </label>
        </>
      )}
      <div className="field">מרחק
        {pills(RANGES, rangeOf(draft).miles, (v) => set({ rangeMiles: v, includeNyc: rangeOf(draft).nyc }))}
        <button className={`chip small ${rangeOf(draft).nyc ? 'on' : ''}`} style={{ alignSelf: 'flex-start' }} aria-pressed={rangeOf(draft).nyc}
          onClick={() => set({ rangeMiles: rangeOf(draft).miles, includeNyc: !rangeOf(draft).nyc })}>
          {rangeOf(draft).nyc ? '✓ ' : '+ '}גם בניו יורק
        </button>
      </div>
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
