import { useEffect, useMemo, useState } from 'react'
import { useAllEvents, useCategory, useStore } from '../lib/store'
import { maybeSignedIn } from '../lib/cloud'
import { loadMemories, type Memory } from '../lib/journal'
import { addDays, daysBetween, todayISO } from '../lib/dates'
import { money } from '../components/ui'
import { Icon } from '../components/Icon'

interface Slide { kicker: string; big: string; title: string; body: string; bg: string; fg: string }

// The month as a handful of full-screen slides. Every number comes from data with a real date in that
// month; a slide with nothing to say is left out rather than padded.
export function Wrapped() {
  const { expenses, categories, settings, profile, people, dropSeen } = useStore()
  const events = useAllEvents()
  const category = useCategory()
  const [memories, setMemories] = useState<Memory[]>([])
  const [i, setI] = useState(0)
  useEffect(() => { if (maybeSignedIn()) loadMemories(300).then(setMemories).catch(() => {}) }, [])

  const today = todayISO()
  const back = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('back') ?? 0) || 0
  const slides = useMemo(() => {
    const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - back, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const name = d.toLocaleDateString('he-IL', { month: 'long' })
    const inMonth = (day: string) => day.startsWith(key) && day <= today
    const daysSoFar = back === 0 ? Number(today.slice(8)) : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const out: Slide[] = [{ kicker: `${name} שלך`, big: String(daysSoFar), title: back === 0 ? `ימים של ${name} עד עכשיו` : `ימים של ${name}`, body: 'בואי נראה מה היה בהם.', bg: '#1D4ED8', fg: '#FFFFFF' }]

    const talked = people.filter((p) => inMonth(p.lastTalk))
    if (talked.length) {
      out.push({ kicker: 'שומרים קשר', big: String(talked.length), title: talked.length === 1 ? 'אדם אחד שדיברת איתו החודש' : 'אנשים שדיברת איתם החודש',
        body: talked.slice(0, 5).map((p) => p.name).join(', ') + '.', bg: '#15803D', fg: '#FFFFFF' })
    }

    const rows = expenses.filter((x) => inMonth(x.date))
    if (rows.length && settings.monthlyBudget > 0) {
      const spent = rows.reduce((s, x) => s + (x.refund ? -x.amount : x.amount), 0)
      const left = settings.monthlyBudget - spent
      const top = [...rows.reduce((m, x) => m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + (x.refund ? -x.amount : x.amount)), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]
      const goal = profile.savingGoal && left > 0 ? ` זה ${Math.min(100, Math.round((left / profile.savingGoal) * 100))}% מיעד החיסכון.` : ''
      out.push({ kicker: 'תקציב', big: money(Math.abs(left)), title: left >= 0 ? (back === 0 ? 'נשארו לך עד עכשיו' : 'נשארו לך בסוף החודש') : 'מעל התקציב החודש',
        body: `הוצאת ${money(spent)} מתוך ${money(settings.monthlyBudget)}.${top && top[1] > 0 ? ` הכי הרבה על ${categories.find((c) => c.id === top[0])?.name ?? 'אחר'}.` : ''}${goal}`, bg: '#0F1B2D', fg: '#FFFFFF' })
    }

    const work = events.filter((e) => e.kind !== 'vacation' && inMonth(e.date) && e.work !== 'personal')
    if (work.length) {
      const by = [...work.reduce((m, e) => m.set(e.work, (m.get(e.work) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])
      out.push({ kicker: 'שליחות', big: String(work.length), title: work.length === 1 ? 'אירוע אחד ביומן השליחות' : 'אירועים ביומן השליחות',
        body: by.map(([id, n]) => `${n} ב${category(id).label}`).join(', ') + '.', bg: '#FDE7CF', fg: '#7C2D12' })
    }

    const mine = memories.filter((m) => inMonth(m.date))
    if (mine.length) {
      const photos = mine.reduce((n, m) => n + m.photos.length, 0)
      out.push({ kicker: 'זיכרונות', big: String(mine.length), title: mine.length === 1 ? 'רגע אחד ששמרת' : 'רגעים ששמרת',
        body: photos ? `עם ${photos === 1 ? 'תמונה אחת' : `${photos} תמונות`}. הם מחכים לך בזיכרונות.` : 'הם מחכים לך בזיכרונות.', bg: '#DBE6FD', fg: '#1E3A8A' })
    }

    const kept = Object.values(dropSeen).filter((s) => inMonth(s.at) && s.did !== 'skip').length
    if (kept) out.push({ kicker: 'גילויים ורעיונות', big: String(kept), title: 'דברים ששמרת מהחפיסה', body: 'הכול נמצא ב"כל התוכן", תחת שמורים.', bg: '#D7F2E3', fg: '#14532D' })
    if (profile.shlichutStart && profile.shlichutStart <= today) {
      const end = profile.shlichutEnd && profile.shlichutEnd > profile.shlichutStart ? profile.shlichutEnd : addDays(profile.shlichutStart, 730)
      const total = daysBetween(profile.shlichutStart, end)
      // for an earlier month, the count as it stood on that month's last day
      const upTo = back === 0 ? today : `${key}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
      const passed = Math.min(total, daysBetween(profile.shlichutStart, upTo) + 1)
      if (passed > 0) {
        out.push({ kicker: 'המסע', big: String(passed), title: `ימים מתוך ${total}`,
          body: passed >= total ? 'כל הדרך. איזה מסע.' : `${Math.round((passed / total) * 100)}% מהדרך.`, bg: '#EDE4FB', fg: '#4C1D95' })
      }
    }
    return out
  }, [profile.shlichutStart, profile.shlichutEnd, today, back, people, expenses, settings.monthlyBudget, profile.savingGoal, categories, events, category, memories, dropSeen])

  const s = slides[Math.min(i, slides.length - 1)]
  const last = i >= slides.length - 1
  return (
    <div className="wrapped" dir="rtl" style={{ background: s.bg, color: s.fg }}>
      <div className="wrapped-segs" aria-hidden="true">{slides.map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}</div>
      <div className="between">
        <span className="bold" style={{ fontSize: 14, opacity: 0.85 }}>{slides[0].kicker} · השליח</span>
        <a href="#/recap" aria-label="סגירה" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}><Icon name="x" size={22} stroke={2.2} /></a>
      </div>
      <div className="wrapped-main" aria-live="polite">
        <span className="bold" style={{ fontSize: 16, opacity: 0.85 }}>{s.kicker}</span>
        <span className="wrapped-big ltr" style={{ textAlign: 'right' }}>{s.big}</span>
        <h1>{s.title}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.5, opacity: 0.9 }}>{s.body}</p>
        {slides.length === 1 && <p style={{ fontSize: 15, opacity: 0.8 }}>עוד אין מספיק מהחודש הזה כדי לסכם. זה יתמלא ככל שתשתמשי באפליקציה.</p>}
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="wrapped-btn" style={{ flex: 1, border: '2px solid currentColor', background: 'transparent', color: 'inherit', opacity: i === 0 ? 0.4 : 1 }}
          disabled={i === 0} onClick={() => setI(i - 1)}>הקודם</button>
        {last
          ? <a href="#/recap" className="wrapped-btn" style={{ flex: 2, border: 0, background: s.fg, color: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>סיום</a>
          : <button className="wrapped-btn" style={{ flex: 2, border: 0, background: s.fg, color: s.bg }} onClick={() => setI(i + 1)}>הבא</button>}
      </div>
    </div>
  )
}
