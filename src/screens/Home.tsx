import { useAllEvents, useCategory, useStore } from '../lib/store'
import { SKY_TEXT, skyOf, toF, useWeather, whatToWear } from '../lib/weather'
import { useFeed } from '../lib/feeds'
import { budgetSummary, colorOf, daysUntilDue, eventsOn } from '../lib/derive'
import { addDays, daysBetween, formatLongDay, todayISO } from '../lib/dates'
import { STATUSES, type TaskStatus } from '../lib/types'
import { lastBackup } from '../lib/backup'
import { Bar, money } from '../components/ui'
import { Icon } from '../components/Icon'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  return 'ערב טוב'
}

export function Home() {
  const { settings, expenses, tasks, people, agentSettings } = useStore()
  const events = useAllEvents()
  const cat = useCategory()
  const weather = useWeather(agentSettings.lat, agentSettings.lng)
  const wear = weather && whatToWear(weather)
  const sky = weather && skyOf(weather.code)
  const deals = useFeed('deals').feed?.items.slice(0, 2) ?? []
  const topic = useFeed('shlichut').feed?.items[0]
  const today = todayISO()
  const b = budgetSummary(expenses, settings.monthlyBudget, today)
  const upcoming = [today, addDays(today, 1)].flatMap((d) => eventsOn(events, d).map((e) => ({ ...e, day: d })))
  const dueNow = people.filter((p) => daysUntilDue(p) <= 0)
  const counts = (['todo', 'doing', 'blocked'] as TaskStatus[]).map((s) => ({ s, n: tasks.filter((t) => t.status === s).length }))

  return (
    <main className="screen">
      <header className="between" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4 }}>
          <p className="muted">{formatLongDay(today)} · {agentSettings.home}</p>
          <h1>{greeting()}, {settings.name}</h1>
        </div>
        <a href="#/settings" className="icon-btn" aria-label="הגדרות וגיבוי"><Icon name="gear" size={20} /></a>
      </header>

      {(() => {
        const last = lastBackup()
        return !last || daysBetween(last, today) > 30 ? (
          <a href="#/settings" className="card link-card small" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
            {last ? 'עבר יותר מחודש מהגיבוי האחרון' : 'עוד לא גיבית את המידע שלך'} — לחצו כאן לגיבוי (לוקח כמה שניות)
          </a>
        ) : null
      })()}

      {weather && wear && sky && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
          <span className="avatar" style={{ borderRadius: 12, background: sky === 'sun' ? '#FEF3C7' : '#E8EEF7', color: sky === 'sun' ? '#B45309' : '#3D5A80' }}>
            <Icon name={sky} size={26} stroke={1.8} />
          </span>
          <span className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <span className="row" style={{ alignItems: 'baseline', gap: 6 }}>
              <span className="big-num ltr" style={{ fontSize: 22 }}>{Math.round(weather.temp)}°C</span>
              <span style={{ fontSize: 14 }}>{SKY_TEXT[sky]}{weather.rainChance >= 30 ? ` · ${weather.rainChance}% גשם` : ''}</span>
            </span>
            <span className="muted small ltr" style={{ textAlign: 'end' }}>{Math.round(weather.max)}° / {Math.round(weather.min)}° · {toF(weather.temp)}°F</span>
          </span>
          <span className="row" style={{ background: 'var(--ground)', borderRadius: 12, padding: '6px 10px 6px 8px', gap: 8 }}>
            <Icon name={wear.wear} size={26} stroke={1.8} />
            <span className="col" style={{ gap: 0 }}>
              <span className="muted" style={{ fontSize: 11 }}>מה ללבוש</span>
              <span className="bold" style={{ fontSize: 13 }}>{wear.text}</span>
            </span>
          </span>
        </div>
      )}

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
          <div key={e.id + e.day} className="event" style={{ background: colorOf(cat(e.work).color).bg, color: colorOf(cat(e.work).color).fg }}>
            <span className="time ltr">{e.kind === 'vacation' ? '—' : e.start ?? 'כל היום'}</span>
            <span className="title" style={{ flex: 1 }}>{e.title}{e.day !== today ? ' (מחר)' : ''}</span>
            <span className="small bold">{cat(e.work).label}</span>
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
          <span className="avatar" style={{ borderRadius: 12, background: 'var(--tzofim-bg)', color: 'var(--primary)' }}><Icon name="star" /></span>
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
