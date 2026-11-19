import { nextCallDate } from '../lib/calls'
import { touchScore } from '../lib/derive'
import { formatLongDay } from '../lib/dates'
import type { Person } from '../lib/types'
import { firstLogged } from '../lib/talks'

const COLORS = ['#1D4ED8', '#EA8A2E', '#2F9E68', '#DB2777', '#CA8A04', '#7C3AED']

// A short "well done" after logging a call. It states only what the app knows: who, when the next
// call is due, how many calls with this person were logged, and the weekly streak.
export function Celebrate({ person, streak, onClose }: { person: Person; streak: number; onClose: () => void }) {
  const logged = person.talks?.length ?? 0
  const since = firstLogged(person)
  const score = touchScore(person.history)
  const calls = person.history?.length ?? 0
  return (
    <div className="sheet-backdrop celebrate" onClick={onClose}>
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} aria-hidden="true" className="confetti"
          style={{ insetInlineStart: `${(i * 53) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 6) * 0.08}s`, borderRadius: i % 3 === 0 ? 6 : 2 }} />
      ))}
      <div className="sheet" role="dialog" aria-label="כל הכבוד" style={{ alignItems: 'center', textAlign: 'center', borderRadius: '28px 28px 0 0', padding: '28px 24px 34px' }}
        onClick={(e) => e.stopPropagation()}>
        {person.photo
          ? <img src={person.photo} alt="" className="celebrate-face" />
          : <span className="celebrate-face">{person.name.slice(0, 1)}</span>}
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>דיברת עם {person.name}</h2>
        <p style={{ fontSize: 15, color: '#3D4757' }}>הטבעת חזרה לירוק. הפעם הבאה: {formatLongDay(nextCallDate(person))}</p>
        {logged >= 2 && since && (
          <span className="small muted">שיחה מספר {logged} עם {person.name} מאז {formatLongDay(since)}</span>
        )}
        {streak >= 2 && <span className="celebrate-note">רצף של {streak} שבועות עם שיחה בכל שבוע</span>}
        {streak < 2 && calls >= 3 && (
          <span className="celebrate-note">{score >= 80 ? `${score}% מהשיחות האחרונות היו בזמן` : `${calls} שיחות אחרונות נרשמו · ${score}% בזמן`}</span>
        )}
        <button className="btn block" style={{ minHeight: 52, borderRadius: 26, marginTop: 6 }} onClick={onClose}>יופי</button>
      </div>
    </div>
  )
}
