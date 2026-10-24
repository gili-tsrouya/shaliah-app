import { useStore } from '../lib/store'
import { useFeed } from '../lib/feeds'
import { budgetSummary, daysUntilDue, eventsOn } from '../lib/derive'
import { addDays, formatLongDay, todayISO } from '../lib/dates'
import { STATUSES, WORKS, type TaskStatus } from '../lib/types'
import { Bar, money } from '../components/ui'
import { Icon } from '../components/Icon'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  return 'ערב טוב'
}

export function Home() {
  const { settings, expenses, events, tasks, people } = useStore()
  const deals = useFeed('deals').feed?.items.slice(0, 2) ?? []
  const topic = useFeed('shlichut').feed?.items[0]
  const today = todayISO()
  const b = budgetSummary(expenses, settings.monthlyBudget, today)
  const upcoming = [today, addDays(today, 1)].flatMap((d) => eventsOn(events, d).map((e) => ({ ...e, day: d })))
  const dueNow = people.filter((p) => daysUntilDue(p) <= 0)
  const counts = (['todo', 'doing', 'blocked'] as TaskStatus[]).map((s) => ({ s, n: tasks.filter((t) => t.status === s).length }))

  return (
    <main className="screen">
      <header className="col" style={{ gap: 4 }}>
        <p className="muted">{formatLongDay(today)} · ניו ג׳רזי</p>
        <h1>{greeting()}, {settings.name}</h1>
      </header>

      <a href="#/self/budget" className="card dark link-card" style={{ gap: 12 }}>
        <div className="between"><span className="muted">נשאר לך החודש</span><span className="muted small">{b.daysLeft} ימים לסוף החודש</span></div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="big-num ltr">{money(b.remaining)}</span>
          <span className="muted">מתוך {money(settings.monthlyBudget)}</span>
        </div>
        <Bar pct={(b.remaining / settings.monthlyBudget) * 100} color="#7DD3A8" />
        <span style={{ fontSize: 14 }}>אפשר להוציא בערך {money(b.perDay)} ליום עד סוף החודש</span>
      </a>

      {dueNow.length > 0 && (
        <a href="#/self/contacts" className="card link-card row" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="avatar"><Icon name="bell" size={20} /></span>
          <span><b>היום כדאי לדבר עם:</b> {dueNow.map((p) => p.name).join(', ')}</span>
        </a>
      )}

      <section className="col">
        <div className="between"><h2>היום ומחר ביומן</h2><a href="#/calendar" className="small bold" style={{ textDecoration: 'none' }}>לכל היומן</a></div>
        {upcoming.length === 0 && <p className="empty">אין אירועים היום ומחר</p>}
        {upcoming.slice(0, 4).map((e) => (
          <div key={e.id + e.day} className={`event w-${e.work}`}>
            <span className="time ltr">{e.kind === 'vacation' ? '—' : e.start ?? 'כל היום'}</span>
            <span className="title" style={{ flex: 1 }}>{e.title}{e.day !== today ? ' (מחר)' : ''}</span>
            <span className="small bold">{WORKS[e.work].label}</span>
          </div>
        ))}
      </section>

      {deals.length > 0 && (
        <section className="col">
          <div className="between"><h2>הסוכן מצא לך</h2><a href="#/self/deals" className="small bold" style={{ textDecoration: 'none' }}>לכל הגילויים</a></div>
          <div className="grid2">
            {deals.map((d) => (
              <div key={d.id} className="card">
                {d.price && <span className={`tag ${d.price === 'חינם' ? 'free' : 'paid'}`}>{d.price}</span>}
                <span className="bold">{d.title}</span>
                <span className="muted small">{[d.when, d.where].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {topic && (
        <a href="#/shlichut" className="card link-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <span className="avatar w-tzofim" style={{ borderRadius: 12 }}><Icon name="star" /></span>
          <span className="col" style={{ gap: 2 }}>
            <span className="small bold" style={{ color: 'var(--primary)' }}>{topic.category}</span>
            <span>{topic.title}</span>
          </span>
        </a>
      )}

      <a href="#/tasks" className="grid3 link-card">
        {counts.map(({ s, n }) => (
          <div key={s} className="card" style={{ alignItems: 'center', gap: 0, padding: 10 }}>
            <span className="big-num" style={{ fontSize: 22, color: s === 'blocked' && n > 0 ? 'var(--danger)' : undefined }}>{n}</span>
            <span className="muted small">{STATUSES[s]}</span>
          </div>
        ))}
      </a>
    </main>
  )
}
