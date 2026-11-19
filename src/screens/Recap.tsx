import { useEffect, useMemo, useState } from 'react'
import { useAllEvents, useCategory, useStore } from '../lib/store'
import { maybeSignedIn } from '../lib/cloud'
import { loadMemories, type Memory } from '../lib/journal'
import { callsBetween } from '../lib/talks'
import { colorOf } from '../lib/derive'
import { addDays, todayISO } from '../lib/dates'
import { money } from '../components/ui'
import { Icon } from '../components/Icon'

type Span = 'week' | 'month'

// A look back at the last week or a whole month, built from what is already in the app.
// It only counts things the app really knows the date of; nothing here is estimated.
export function Recap() {
  const { expenses, categories, settings, dropSeen, people } = useStore()
  const events = useAllEvents()
  const category = useCategory()
  const [span, setSpan] = useState<Span>('week')
  const [back, setBack] = useState(0) // 0 = the current one, 1 = the one before…
  const [memories, setMemories] = useState<Memory[]>([])
  useEffect(() => { if (maybeSignedIn()) loadMemories(200).then(setMemories).catch(() => {}) }, [])

  const today = todayISO()
  const { from, to, title } = useMemo(() => {
    if (span === 'week') {
      const end = addDays(today, -7 * back)
      const start = addDays(end, -6)
      return { from: start, to: end, title: back === 0 ? 'השבוע האחרון' : `${start.slice(8)}.${start.slice(5, 7)} – ${end.slice(8)}.${end.slice(5, 7)}` }
    }
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}`, title: d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) }
  }, [span, back, today])
  const within = (day: string) => day >= from && day <= to && day <= today

  const happened = events.filter((e) => e.kind !== 'vacation' && within(e.date))
  const byCategory = [...happened.reduce((m, e) => m.set(e.work, (m.get(e.work) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])
  const spentRows = expenses.filter((x) => within(x.date))
  const spent = spentRows.reduce((s, x) => s + (x.refund ? -x.amount : x.amount), 0)
  const topSpend = [...spentRows.reduce((m, x) => m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + (x.refund ? -x.amount : x.amount)), new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])[0]
  const mine = memories.filter((m) => within(m.date))
  const photos = mine.flatMap((m) => m.photos).filter((p) => p.url)
  const kept = Object.values(dropSeen).filter((s) => within(s.at) && s.did !== 'skip').length
  const calls = callsBetween(people, from, to < today ? to : today)
  const talked = calls.byPerson.map((x) => x.name)
  const empty = happened.length === 0 && spentRows.length === 0 && mine.length === 0 && kept === 0 && talked.length === 0
  const monthShare = span === 'month' && settings.monthlyBudget > 0 ? Math.round((spent / settings.monthlyBudget) * 100) : null

  return (
    <main className="screen">
      <header className="row">
        <a href="#/home" className="icon-btn" aria-label="חזרה"><Icon name="chevronR" /></a>
        <h1>מבט לאחור</h1>
      </header>
      <div className="segmented">
        {([['week', 'שבוע'], ['month', 'חודש']] as const).map(([s, l]) => (
          <button key={s} className={span === s ? 'on' : ''} aria-pressed={span === s} onClick={() => { setSpan(s); setBack(0) }}>{l}</button>
        ))}
      </div>
      <div className="between">
        <button className="icon-btn" aria-label="קודם" onClick={() => setBack(back + 1)}><Icon name="chevronR" size={18} /></button>
        <span className="bold" style={{ fontSize: 17 }}>{title}</span>
        <button className="icon-btn" aria-label="הבא" disabled={back === 0} style={{ opacity: back === 0 ? 0.35 : 1 }} onClick={() => setBack(Math.max(0, back - 1))}><Icon name="chevronL" size={18} /></button>
      </div>

      {span === 'month' && (
        <a href={`#/wrapped?back=${back}`} className="card hero link-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <span className="col" style={{ gap: 2, flex: 1 }}>
            <span className="bold" style={{ fontSize: 16 }}>הסיכום של {title}</span>
            <span style={{ fontSize: 14, color: '#C9CCD1' }}>החודש שלך בכמה מסכים</span>
          </span>
          <Icon name="chevronL" size={20} />
        </a>
      )}

      {empty && <p className="empty">אין עדיין מה להראות על התקופה הזאת.</p>}

      {photos.length > 0 && (
        <a href="#/journal" className="link-card">
          <div className={`journal-photos n${Math.min(photos.length, 3)}`} style={{ pointerEvents: 'none' }}>
            {photos.slice(0, 6).map((p) => <button key={p.id} tabIndex={-1}><img src={p.url} alt="" loading="lazy" /></button>)}
          </div>
        </a>
      )}

      {mine.length > 0 && (
        <section className="card" style={{ gap: 8 }}>
          <div className="between"><h2>רגעים</h2><span className="big-num" style={{ fontSize: 24 }}>{mine.length}</span></div>
          {mine.filter((m) => m.body).slice(0, 3).map((m) => (
            <p key={m.id} className="muted" style={{ borderInlineStart: '3px solid var(--yj-dot)', paddingInlineStart: 10, lineHeight: 1.45 }}>{m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body}</p>
          ))}
        </section>
      )}

      {happened.length > 0 && (
        <section className="card" style={{ gap: 8 }}>
          <div className="between"><h2>ביומן</h2><span className="big-num" style={{ fontSize: 24 }}>{happened.length}</span></div>
          <div className="chips" style={{ gap: 6 }}>
            {byCategory.map(([id, n]) => (
              <span key={id} className="tag" style={{ background: colorOf(category(id).color).bg, color: colorOf(category(id).color).fg, fontSize: 13 }}>{category(id).label} · {n}</span>
            ))}
          </div>
        </section>
      )}

      {spentRows.length > 0 && (
        <section className="card hero" style={{ gap: 6 }}>
          <span className="muted">הוצאות</span>
          <span className="big-num ltr">{money(spent)}</span>
          {monthShare !== null && <span style={{ fontSize: 14 }}>{monthShare}% מהתקציב החודשי ({money(settings.monthlyBudget)})</span>}
          {topSpend && topSpend[1] > 0 && <span style={{ fontSize: 14 }}>הכי הרבה על: {categories.find((c) => c.id === topSpend[0])?.name ?? 'אחר'} ({money(topSpend[1])})</span>}
        </section>
      )}

      {(talked.length > 0 || kept > 0) && (
        <div className="grid2">
          {talked.length > 0 && (
            <div className="card" style={{ gap: 4 }}>
              <span className="big-num" style={{ fontSize: 24 }}>{calls.total}</span>
              <span className="bold small">{calls.total === 1 ? 'שיחה' : 'שיחות'} · דיברת עם</span>
              <span className="muted small">{talked.slice(0, 4).join(', ')}{talked.length > 4 ? '…' : ''}</span>
            </div>
          )}
          {kept > 0 && (
            <a href="#/drop?all" className="card link-card" style={{ gap: 4 }}>
              <span className="big-num" style={{ fontSize: 24 }}>{kept}</span>
              <span className="bold small">רעיונות וגילויים ששמרת</span>
              <span className="muted small">לכל התוכן</span>
            </a>
          )}
        </div>
      )}

      {!maybeSignedIn() && <a href="#/account" className="muted small" style={{ textAlign: 'center' }}>כניסה לחשבון תוסיף לכאן את הרגעים והתמונות</a>}
    </main>
  )
}
