import { useMemo, useRef, useState } from 'react'
import { useStore, newId } from '../lib/store'
import { useFeed } from '../lib/feeds'
import { allItems, isFree, markOf, newItems, type DropItem } from '../lib/drop'
import { chatGptUrl } from '../lib/ideas'
import { todayISO } from '../lib/dates'
import { Icon } from '../components/Icon'

type Filter = 'all' | 'saved' | 'shl' | 'deal'

export function Drop() {
  const shl = useFeed('shlichut')
  const deals = useFeed('deals')
  const { agentSettings, dropSeen, setDropSeen, savedDeals, setSavedDeals, savedIdeas, setSavedIdeas, setEvents, calCategories, partnerships } = useStore()
  const [mode, setMode] = useState<'drop' | 'all'>(location.hash.includes('all') ? 'all' : 'drop')
  const [filter, setFilter] = useState<Filter>('all')
  const [savedNow, setSavedNow] = useState(0)
  const [again, setAgain] = useState<DropItem[] | null>(null)
  const [pos, setPos] = useState(0)
  const [drag, setDrag] = useState(0)
  const startX = useRef<number | null>(null)
  const today = todayISO()

  const loaded = !!shl.feed && !!deals.feed
  const failed = shl.error && deals.error
  const all = useMemo(
    () => allItems(shl.feed?.items ?? [], deals.feed?.items ?? [], agentSettings, today),
    [shl.feed, deals.feed, agentSettings, today],
  )
  // What was new when the screen opened stays the deck for this visit, so the count does not jump around
  const [frozen, setFrozen] = useState<DropItem[] | null>(null)
  const fresh = useMemo(() => newItems(all, dropSeen), [all, dropSeen])
  if (loaded && frozen === null) setFrozen(fresh)
  const deck = again ?? frozen ?? []
  const cur = deck[pos]
  const done = loaded && pos >= deck.length

  const isSaved = (d: DropItem) => (d.type === 'deal' ? savedDeals : savedIdeas).includes(d.item.id)
  const setSaved = (d: DropItem, on: boolean) => {
    const set = d.type === 'deal' ? setSavedDeals : setSavedIdeas
    set((s) => (on ? (s.includes(d.item.id) ? s : [...s, d.item.id]) : s.filter((x) => x !== d.item.id)))
  }
  const partnerFor = (d: DropItem) => partnerships.find((p) => d.item.forPartnerships?.some((f) => f.id === p.id))
  const ideaFor = (d: DropItem) => d.item.forPartnerships?.find((f) => f.id === partnerFor(d)?.id)?.idea ?? d.item.idea
  const gpt = (d: DropItem) => chatGptUrl(d.item, ideaFor(d), partnerFor(d))

  const next = (did: 'skip' | 'save' | 'act') => {
    if (!cur) return
    if (did !== 'skip') {
      if (!isSaved(cur)) setSavedNow((n) => n + 1)
      setSaved(cur, true)
    }
    setDropSeen((s) => ({ ...s, [cur.item.id]: { at: today, did, mark: markOf(cur.item) } }))
    setDrag(0)
    setPos((p) => p + 1)
  }

  const act = () => {
    if (!cur) return
    if (cur.type === 'shl') window.open(gpt(cur), '_blank', 'noopener')
    else if (cur.item.date) {
      const work = calCategories.find((c) => c.id === 'personal')?.id ?? calCategories[0]?.id ?? 'personal'
      setEvents((ev) => [...ev, { id: newId(), title: cur.item.title, work, kind: 'event', date: cur.item.date! }])
    } else if (cur.item.url) window.open(cur.item.url, '_blank', 'noopener')
    next('act')
  }
  const actionLabel = (d: DropItem) => (d.type === 'shl' ? 'בנה פעילות' : d.item.date ? 'אני הולכת · ליומן' : d.item.url ? 'לפרטים' : 'שמרי')

  // Swipe: right keeps, left skips (the same in a right-to-left layout: the card follows the finger)
  const onDown = (e: React.PointerEvent) => { startX.current = e.clientX }
  const onMove = (e: React.PointerEvent) => { if (startX.current != null) setDrag(e.clientX - startX.current) }
  const onUp = () => {
    if (startX.current == null) return
    startX.current = null
    if (drag > 90) next('save')
    else if (drag < -90) next('skip')
    else setDrag(0)
  }

  const savedCount = all.filter(isSaved).length
  const lib = all.filter((d) => filter === 'all' || (filter === 'saved' && isSaved(d)) || filter === d.type)
  const chips: [Filter, string][] = [['all', 'הכל'], ['saved', `שמורים · ${savedCount}`], ['shl', 'שליחות'], ['deal', 'לעצמי']]
  const big = (d: DropItem) => (d.type === 'deal' ? d.item.price ?? '' : d.item.category)

  return (
    <main className="screen drop">
      <div className="row" style={{ gap: 10 }}>
        <a href="#/home" className="icon-btn" aria-label="חזרה לבית"><Icon name="chevronR" /></a>
        <div role="tablist" aria-label="תצוגה" className="segmented" style={{ flex: 1 }}>
          <button role="tab" aria-selected={mode === 'drop'} className={mode === 'drop' ? 'on' : ''} onClick={() => setMode('drop')}>
            חדש{deck.length - pos > 0 && !again ? ` · ${deck.length - pos}` : ''}
          </button>
          <button role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>כל התוכן</button>
        </div>
      </div>

      {failed && <p className="empty">לא הצלחתי לטעון את התוכן. בדקי את החיבור לאינטרנט.</p>}
      {!loaded && !failed && <p className="empty">טוען…</p>}

      {mode === 'drop' && loaded && cur && (
        <>
          <div className="drop-segs" aria-hidden="true">
            {deck.length <= 14
              ? deck.map((d, i) => <span key={d.item.id} className={i < pos ? 'past' : i === pos ? 'now' : ''} />)
              : <span className="now" style={{ flex: (pos + 1) / deck.length }} />}
          </div>
          <span className="muted small" aria-live="polite">{pos + 1} מתוך {deck.length}</span>

          <article className="drop-card" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ transform: `translateX(${drag}px) rotate(${drag / 30}deg)`, transition: startX.current == null ? 'transform .2s' : 'none' }}>
            <div className={`drop-band ${cur.type}`}>
              <span className="row" style={{ gap: 6 }}>
                <span className="drop-pill">{cur.type === 'shl' ? 'שליחות' : 'לעצמי'} · {cur.item.category}</span>
                {cur.changed && <span className="drop-pill">עודכן</span>}
              </span>
              <span className="drop-big">{big(cur)}</span>
            </div>
            <div className="drop-body">
              <h2>{cur.item.title}</h2>
              {cur.item.summary && <p>{cur.item.summary}</p>}
              <div className="col" style={{ gap: 4, marginTop: 'auto' }}>
                {cur.item.when && <span className="muted">{cur.item.when}</span>}
                {cur.item.where && <span className="muted">{cur.item.where}</span>}
              </div>
            </div>
            {drag > 40 && <span className="drop-hint keep">שמרתי</span>}
            {drag < -40 && <span className="drop-hint skip">דילגתי</span>}
          </article>

          <div className="row" style={{ gap: 10 }}>
            <button className="drop-round" aria-label="דלגי" onClick={() => next('skip')}><Icon name="x" size={22} stroke={2.2} /></button>
            <button className="btn drop-act" onClick={act}>{actionLabel(cur)}</button>
            <button className="drop-round keep" aria-label="שמרי לאחר כך" onClick={() => next('save')}><Icon name="bookmark" size={22} /></button>
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>החלקה ימינה שומרת, שמאלה מדלגת</p>
        </>
      )}

      {mode === 'drop' && done && (
        <div className="drop-done">
          <span className="drop-check"><Icon name="check" size={44} stroke={2.2} /></span>
          <h2>{deck.length === 0 ? 'אין חדש כרגע' : 'זהו להיום'}</h2>
          <p>
            {deck.length === 0
              ? 'כבר עברת על הכול. הסוכנים מביאים תוכן חדש כל בוקר.'
              : `${savedNow > 0 ? `שמרת ${savedNow === 1 ? 'דבר אחד' : `${savedNow} דברים`}. ` : ''}התוכן הבא יגיע מחר בבוקר.`}
          </p>
          <button className="btn" onClick={() => setMode('all')}>לכל התוכן</button>
          {all.length > 0 && (
            <button className="drop-link" onClick={() => { setAgain(all); setPos(0); setSavedNow(0) }}>לעבור שוב על הכול</button>
          )}
        </div>
      )}

      {mode === 'all' && loaded && (
        <>
          <div className="col" style={{ gap: 2 }}>
            <h1 style={{ fontSize: 24 }}>כל התוכן במקום אחד</h1>
            <p className="muted" style={{ fontSize: 14 }}>פעילויות לנוער וגילויים לעצמך</p>
          </div>
          <div className="chips">
            {chips.map(([id, label]) => (
              <button key={id} className={`chip ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
          <div className="col" style={{ gap: 8 }}>
            {lib.map((d) => (
              <div key={d.item.id} className="drop-row">
                <span className={`drop-badge ${d.type}`}>{d.type === 'shl' ? d.item.category.slice(0, 2) : '$'}</span>
                <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="muted small">{[d.item.category, d.item.when].filter(Boolean).join(' · ')}</span>
                  {d.item.url
                    ? <a className="bold" style={{ fontSize: 14, color: 'inherit', textDecoration: 'none' }} href={d.item.url} target="_blank" rel="noreferrer">{d.item.title}</a>
                    : <span className="bold" style={{ fontSize: 14 }}>{d.item.title}</span>}
                </span>
                {d.type === 'deal' && d.item.price && <span className={`tag ${isFree(d.item) ? 'free' : 'paid'}`} style={{ alignSelf: 'center' }}>{d.item.price}</span>}
                {d.type === 'shl' && (
                  <a className="drop-gpt" href={gpt(d)} target="_blank" rel="noreferrer" aria-label="בנה פעילות ב-ChatGPT"><Icon name="sparkle" size={18} /></a>
                )}
                <button className={`icon-btn ${isSaved(d) ? 'solid' : ''}`} style={{ borderRadius: 12 }} aria-pressed={isSaved(d)}
                  aria-label={isSaved(d) ? 'הסירי משמורים' : 'שמרי'} onClick={() => setSaved(d, !isSaved(d))}>
                  <Icon name="bookmark" size={18} />
                </button>
              </div>
            ))}
            {lib.length === 0 && (
              <p className="empty">{filter === 'saved' ? 'עוד לא שמרת כלום. בחפיסה של "חדש", לחצי על הסימנייה.' : 'אין כאן תוכן כרגע.'}</p>
            )}
          </div>
        </>
      )}
    </main>
  )
}
