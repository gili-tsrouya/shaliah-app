import { useState } from 'react'
import { useStore } from '../lib/store'
import { exportBackup, lastBackup, readBackup, restoreBackup } from '../lib/backup'
import { daysBetween, formatDay, todayISO } from '../lib/dates'
import { Icon } from '../components/Icon'

export function Settings() {
  const { settings } = useStore()
  const [last, setLast] = useState(lastBackup)
  const [msg, setMsg] = useState('')
  const [pending, setPending] = useState<Awaited<ReturnType<typeof readBackup>> | null>(null)

  const doExport = async () => {
    try {
      if (await exportBackup()) {
        setLast(lastBackup())
        setMsg('הגיבוי נוצר. בחרו "שמירה בקבצים" ← iCloud Drive כדי לשמור אותו.')
      }
    } catch {
      setMsg('יצירת הגיבוי נכשלה.')
    }
  }

  return (
    <main className="screen">
      <header className="row">
        <a href="#/home" className="icon-btn" aria-label="חזרה"><Icon name="chevronR" /></a>
        <h1>הגדרות</h1>
      </header>

      <a href="#/profile" className="card link-card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <span className="avatar"><Icon name="user" size={20} /></span>
        <span className="col" style={{ gap: 0, flex: 1 }}>
          <span className="bold">הפרופיל שלי</span>
          <span className="muted small">{settings.name} · גיל, מגורים, תקציב, תחביבים</span>
        </span>
        <Icon name="chevronL" size={18} />
      </a>

      <section className="card" style={{ gap: 12 }}>
        <h2>גיבוי</h2>
        <p className="muted">
          כל המידע שלך (הוצאות, משימות, אנשים, תמונות) שמור רק בטלפון. גיבוי יוצר קובץ אחד שאפשר לשמור ב-iCloud Drive,
          ולשחזר ממנו בטלפון חדש או אם משהו נמחק.
        </p>
        <p className="small bold" style={{ color: !last || daysBetween(last, todayISO()) > 30 ? 'var(--warn)' : 'var(--ok)' }}>
          {last ? `גיבוי אחרון: ${formatDay(last)}` : 'עוד לא נוצר גיבוי'}
        </p>
        <button className="btn block" onClick={doExport}>ייצוא גיבוי</button>
        <label className="btn light block row" style={{ justifyContent: 'center', cursor: 'pointer' }}>
          שחזור מגיבוי
          <input type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                setPending(await readBackup(f))
                setMsg('')
              } catch (err) {
                setMsg((err as Error).message || 'לא הצלחתי לקרוא את הקובץ.')
              }
            }} />
        </label>
        {pending && (
          <div className="card" style={{ borderColor: 'var(--danger)', gap: 10 }}>
            <span className="bold">לשחזר את הגיבוי מ-{formatDay(pending.createdAt.slice(0, 10))}?</span>
            <span className="small muted">כל מה שיש עכשיו באפליקציה יוחלף במה שבקובץ.</span>
            <div className="row">
              <button className="btn danger" style={{ flex: 1 }} onClick={() => restoreBackup(pending)}>כן, לשחזר</button>
              <button className="btn light" onClick={() => setPending(null)}>ביטול</button>
            </div>
          </div>
        )}
        {msg && <p className="small">{msg}</p>}
      </section>
      <p className="muted small ltr" style={{ textAlign: 'center' }}>גרסה {__BUILD__}</p>
    </main>
  )
}
