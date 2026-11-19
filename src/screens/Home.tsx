import { useEffect, useState } from 'react'
import { useAllEvents, useCategory, useStore } from '../lib/store'
import { SKY_TEXT, skyOf, toF, useWeather, whatToWear } from '../lib/weather'
import { budgetSummary, colorOf, daysUntilDue, eventsOn, sortByPriority } from '../lib/derive'
import { addDays, daysBetween, formatLongDay, israelTime, todayISO } from '../lib/dates'
import { lastBackup } from '../lib/backup'
import { maybeSignedIn } from '../lib/cloud'
import { currentPlace } from '../lib/places'
import { todayTasks } from '../lib/tasks'
import { Bar, money } from '../components/ui'
import { Icon } from '../components/Icon'

const ISRAEL = 'Asia/Jerusalem'
const clock = (d: Date, timeZone?: string) => d.toLocaleTimeString('he-IL', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
// Hebrew day of month in letters (ט׳ בכסלו), as on a Hebrew calendar
const gematria = (n: number) => {
  const tens = ['', 'י', 'כ', 'ל'][Math.floor(n / 10)]
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'][n % 10]
  const letters = n === 15 ? 'טו' : n === 16 ? 'טז' : tens + ones
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`
}
const hebrewDate = (d: Date) => {
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', { day: 'numeric', month: 'long' }).formatToParts(d)
    const day = Number(parts.find((p) => p.type === 'day')?.value)
    const month = parts.find((p) => p.type === 'month')?.value
    return day && month ? `${gematria(day)} ב${month.replace(/^ב/, '')}` : ''
  } catch {
    return ''
  }
}
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// Two clocks: where she is, and Israel
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function Home() {
  const { settings, expenses, tasks, people, agentSettings, profile } = useStore()
  const events = useAllEvents()
  const cat = useCategory()
  const now = useNow()
  const place = currentPlace(agentSettings)
  const weather = useWeather(place.lat, place.lng)
  const wear = weather && whatToWear(weather)
  const sky = weather && skyOf(weather.code)
  const today = todayISO()
  const inIsrael = localZone() === ISRAEL || clock(now) === clock(now, ISRAEL)
  const b = budgetSummary(expenses, settings.monthlyBudget, today, profile.savingGoal)
  const todays = eventsOn(events, today).filter((e) => e.kind !== 'vacation')
  const tomorrow = eventsOn(events, addDays(today, 1)).filter((e) => e.kind !== 'vacation')
  const chosen = todayTasks(tasks, today)
  const toCall = sortByPriority(people, today).slice(0, 4)
  const ring = (d: number) => (d < 0 ? '#C2410C' : d <= 1 ? '#B7791F' : '#2E9A5E')
  const last = lastBackup()
  const needsBackup = !maybeSignedIn() && (!last || daysBetween(last, today) > 30)
  const placeName = place.name.split(',')[0]

  return (
    <main className="screen" style={{ gap: 22 }}>
      <header className="col" style={{ gap: 10 }}>
        <div className="between">
          <span className="muted" style={{ fontWeight: 600 }}>{formatLongDay(today)}{hebrewDate(now) ? `, ${hebrewDate(now)}` : ''}</span>
          <span className="row" style={{ gap: 4 }}>
            <a href="#/profile" className="icon-btn" style={{ border: 0, background: 'transparent', width: 40, height: 40 }} aria-label="הפרופיל שלי"><Icon name="user" size={20} /></a>
            <a href="#/settings" className="icon-btn" style={{ border: 0, background: 'transparent', width: 40, height: 40 }} aria-label="הגדרות וגיבוי"><Icon name="gear" size={20} /></a>
          </span>
        </div>
        <div className="clocks">
          <div>
            <span className="clock ltr">{clock(now)}</span>
            <span className="bold" style={{ fontSize: 15 }}>{inIsrael ? 'כאן ובישראל' : placeName}</span>
          </div>
          {!inIsrael && (
            <div className="other">
              <span className="clock ltr">{clock(now, ISRAEL)}</span>
              <span className="bold" style={{ fontSize: 15 }}>ישראל</span>
            </div>
          )}
        </div>
        {weather && wear && sky && (
          <span className="row muted" style={{ gap: 6 }}>
            <Icon name={sky} size={20} stroke={1.8} />
            <span><span className="ltr">{Math.round(weather.temp)}°C ({toF(weather.temp)}°F)</span>, {SKY_TEXT[sky]}{weather.rainChance >= 30 ? `, ${weather.rainChance}% גשם` : ''}. {wear.text}</span>
          </span>
        )}
      </header>

      {needsBackup && (
        <a href="#/account" className="card link-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="cloud" size={22} />
          <span className="col" style={{ gap: 0, flex: 1 }}>
            <span className="bold">המידע שלך שמור רק בטלפון</span>
            <span className="muted small">כניסה לחשבון מגבה אותו אוטומטית</span>
          </span>
          <Icon name="chevronL" size={18} />
        </a>
      )}

      <section className="col" style={{ gap: 8 }}>
        <div className="section-head"><h2>היום</h2><a href="#/calendar">כל היומן</a></div>
        <div className="group">
          {todays.length === 0 && <div className="group-row muted">אין אירועים היום{tomorrow.length ? `. מחר: ${tomorrow[0].title}` : ''}</div>}
          {todays.slice(0, 5).map((e) => (
            <a key={e.id} href="#/calendar" className="group-row" style={{ minHeight: 60 }}>
              <span className="ltr bold" style={{ width: 48, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{e.start ?? 'כל היום'}</span>
              <span className="dot8" style={{ background: colorOf(cat(e.work).color).dot }} />
              <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{e.title}</span>
                <span className="small muted">{cat(e.work).label}{e.start && !inIsrael && e.id.startsWith('call_') ? `, ${israelTime(e.start)} בישראל` : ''}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <a href="#/tasks" className="card link-card" style={{ gap: 6 }}>
        <span className="between"><span className="bold" style={{ fontSize: 17 }}>שלוש להיום</span><span className="small muted">{chosen.length} מתוך 3</span></span>
        {chosen.length === 0
          ? <span className="muted">עוד לא בחרת משימות להיום</span>
          : chosen.map((t, i) => <span key={t.id} style={{ fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? 'קודם כל: ' : ''}{t.title}</span>)}
      </a>

      {toCall.length > 0 && (
        <section className="col" style={{ gap: 10 }}>
          <div className="section-head"><h2>כדאי להתקשר</h2><a href="#/self/contacts">כולם</a></div>
          <div className="grid4" style={{ gap: 8 }}>
            {toCall.map((p) => {
              const d = daysUntilDue(p, today)
              return (
                <a key={p.id} href="#/self/contacts" className="call-face" aria-label={`${p.name}, ${d < 0 ? 'באיחור' : d === 0 ? 'היום' : `בעוד ${d} ימים`}`}>
                  <span className="ring" style={{ borderColor: ring(d) }}>
                    {p.photo ? <img src={p.photo} alt="" /> : <span>{p.name.slice(0, 1)}</span>}
                  </span>
                  <span className="small bold">{p.name}</span>
                </a>
              )
            })}
          </div>
        </section>
      )}

      <a href="#/self/budget" className="card link-card" style={{ gap: 8 }}>
        <span className="between"><span className="muted" style={{ fontWeight: 600 }}>נשארו לך החודש</span><span className="small muted">עוד {b.daysLeft} ימים</span></span>
        <span className="between" style={{ alignItems: 'baseline' }}>
          <span className="big-num ltr" style={{ fontSize: 30 }}>{money(b.remaining)}</span>
          <span className="muted">מתוך <span className="ltr">{money(settings.monthlyBudget)}</span></span>
        </span>
        <Bar pct={(b.remaining / Math.max(1, settings.monthlyBudget)) * 100} />
        <span className="small muted">בערך {money(b.perDay)} ליום עד סוף החודש</span>
      </a>

      <div className="group">
        <a href="#/recap" className="group-row">
          <Icon name="calendar" size={20} />
          <span style={{ flex: 1, fontWeight: 600 }}>מבט לאחור על השבוע והחודש</span>
          <Icon name="chevronL" size={18} />
        </a>
        <a href="#/journal" className="group-row">
          <Icon name="photo" size={20} />
          <span style={{ flex: 1, fontWeight: 600 }}>רגע מהיום לזיכרונות</span>
          <Icon name="chevronL" size={18} />
        </a>
      </div>
    </main>
  )
}
