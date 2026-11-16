import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { backupIfNeeded, cloudAvailable, emailSignIn, copyPhoneToAccount, restoreFromAccount, currentSession, lastAccountCopy, lastCopySource, onSession, sendEmailCode, signInWithGoogle, signOut, verifyEmailCode, type CopyReport, type CopySource } from '../lib/cloud'
import { formatDay } from '../lib/dates'
import { restoreBackup } from '../lib/backup'
import { Icon } from '../components/Icon'

const ROWS: [string, string][] = [
  ['tasks', 'משימות'], ['events', 'אירועים'], ['people', 'אנשים'], ['expenses', 'הוצאות'], ['owed', 'חייבים לי'],
  ['budget_categories', 'קטגוריות תקציב'], ['calendar_categories', 'קטגוריות יומן'], ['partnerships', 'שותפויות'], ['saved_finds', 'גילויים שמורים'],
]

// Side by side: what the phone has and what reached the account. A difference is shown, never hidden.
function Counts({ report }: { report: CopyReport }) {
  const rows = ROWS.filter(([k]) => typeof report.account?.[k] === 'number')
  const differ = rows.filter(([k]) => typeof report.phone?.[k] === 'number' && report.phone[k] !== report.account[k])
  const skipped = Object.values(report.skipped ?? {}).reduce((a, b) => a + (Number(b) || 0), 0)
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="between small muted"><span /><span>במכשיר ← בחשבון</span></div>
      {rows.map(([k, label]) => (
        <div key={k} className="between small">
          <span>{label}</span>
          <span className="ltr bold">{String(report.phone?.[k] ?? '–')} → {String(report.account[k])}</span>
        </div>
      ))}
      <span className="small bold" style={{ color: differ.length ? 'var(--warn)' : 'var(--ok)' }}>
        {differ.length ? `יש הבדל ב: ${differ.map(([, l]) => l).join(', ')}. המידע במכשיר נשאר שלם.` : 'הכול תואם.'}
      </span>
      {skipped > 0 && <span className="small muted">{skipped} פריטים בלי תאריך לא הועתקו ונשארו במכשיר.</span>}
      <span className="small muted">תמונות של אנשים נשמרות בתוך העותק, ויוצגו מהחשבון בשלב הבא.</span>
    </div>
  )
}

export function Account() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [report, setReport] = useState<CopyReport | null>(null)
  const [last, setLast] = useState(lastAccountCopy)
  // which device the copy in the account came from; undefined while it is being looked up
  const [source, setSource] = useState<CopySource | null | undefined>(undefined)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    lastCopySource().then(setSource).catch(() => setSource(null))
  }, [userId])
  const otherDevice = source ? !source.thisDevice : false
  const [confirmRestore, setConfirmRestore] = useState(false)
  // signing in on the device that owns the copy (or the first device) starts the automatic backup right away
  useEffect(() => {
    if (!userId || source === undefined || otherDevice) return
    backupIfNeeded().then((state) => {
      if (state === 'saved') {
        setLast(lastAccountCopy())
        lastCopySource().then(setSource).catch(() => {})
      }
    })
  }, [userId, source, otherDevice])

  useEffect(() => {
    if (!cloudAvailable) return
    let stop = () => {}
    currentSession().then((s) => { setSession(s); setReady(true) }).catch(() => setReady(true))
    onSession(setSession).then((off) => { stop = off })
    return () => stop()
  }, [])

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true)
    setMsg('')
    try {
      await work()
    } catch {
      setMsg(failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <header className="row">
        <a href="#/settings" className="icon-btn" aria-label="חזרה"><Icon name="chevronR" /></a>
        <h1>החשבון שלי</h1>
      </header>

      {!cloudAvailable && <p className="muted">החשבון עוד לא זמין בגרסה הזאת.</p>}

      {cloudAvailable && ready && !session && (
        <section className="card" style={{ gap: 12 }}>
          <h2>כניסה</h2>
          <p className="muted">חשבון שומר עותק של המידע שלך מחוץ לטלפון, כך שהוא לא הולך לאיבוד אם הטלפון מוחלף או נמחק.</p>
          <button className="btn block" disabled={busy} onClick={() => run(signInWithGoogle, 'הכניסה עם Google נכשלה. נסי שוב.')}>כניסה עם Google</button>
          {emailSignIn && (
            <>
            <p className="muted small" style={{ textAlign: 'center' }}>או קוד במייל</p>
            <label className="field">מייל
              <input className="ltr" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setSent(false) }} />
            </label>
            {!sent && (
              <button className="btn light block" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}
                onClick={() => run(async () => { await sendEmailCode(email.trim()); setSent(true) }, 'לא הצלחתי לשלוח קוד. אפשר לנסות שוב בעוד דקה.')}>
                שלחו לי קוד
              </button>
            )}
            {sent && (
              <>
                <p className="small">שלחנו קוד למייל. הוא תקף לשעה.</p>
                <label className="field">קוד
                  <input className="ltr" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </label>
                <button className="btn block" disabled={busy || code.length < 6 || code.length > 8}
                  onClick={() => run(() => verifyEmailCode(email.trim(), code), 'הקוד לא נכון או שפג תוקפו.')}>
                  כניסה
                </button>
              </>
            )}
            </>
          )}
          {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
        </section>
      )}

      {cloudAvailable && session && (
        <>
          <section className="card" style={{ gap: 8 }}>
            <h2>מחוברת</h2>
            <p className="ltr small" style={{ textAlign: 'start' }}>{session.user.email}</p>
            <button className="btn light" disabled={busy} onClick={() => run(async () => { await signOut(); setReport(null) }, 'היציאה נכשלה.')}>יציאה</button>
          </section>

          <section className="card" style={{ gap: 12 }}>
            <h2>גיבוי בחשבון</h2>
            <p className="muted">
              {otherDevice
                ? 'הגיבוי האוטומטי פועל מהמכשיר שממנו הגיע העותק. המכשיר הזה לא שולח כלום עד שתבחרי בו.'
                : 'מהמכשיר הזה, כל שינוי נשמר בחשבון אוטומטית תוך כמה דקות. שום דבר במכשיר לא משתנה, והאפליקציה ממשיכה לעבוד גם בלי אינטרנט.'}
            </p>
            {last && !otherDevice && <p className="small bold" style={{ color: 'var(--ok)' }}>גיבוי אחרון מהמכשיר הזה: {formatDay(last.slice(0, 10))}</p>}
            {otherDevice && source && (
              <div className="card" style={{ borderColor: 'var(--warn)', gap: 8 }}>
                <span className="bold">העותק שבחשבון הגיע ממכשיר אחר ({source.label}, {formatDay(source.at.slice(0, 10))}).</span>
                <span className="small muted">העתקה מכאן תחליף אותו במה ששמור במכשיר הזה. כדאי להעתיק רק מהמכשיר שבו נמצא המידע האמיתי.</span>
                {!confirmReplace && <button className="btn light" onClick={() => setConfirmReplace(true)}>המידע האמיתי נמצא כאן</button>}
              </div>
            )}
            <button className="btn block" disabled={busy || source === undefined || (otherDevice && !confirmReplace)}
              onClick={() => run(async () => {
                setReport(await copyPhoneToAccount())
                setLast(lastAccountCopy())
                setConfirmReplace(false)
                setSource(await lastCopySource())
              }, 'ההעתקה נכשלה. המידע במכשיר לא השתנה. אפשר לנסות שוב.')}>
              {busy ? 'שומר…' : otherDevice ? 'להחליף את העותק במה שיש כאן' : 'לגבות עכשיו'}
            </button>
            {report && (
              <div className="card" style={{ gap: 8 }}>
                <span className="bold">הועתק. זה מה שיש עכשיו בחשבון:</span>
                <Counts report={report} />
              </div>
            )}
            {msg && <p className="small" style={{ color: 'var(--danger)' }}>{msg}</p>}
          </section>

          {source && (
            <section className="card" style={{ gap: 10 }}>
              <h2>שחזור למכשיר הזה</h2>
              <p className="muted">לטלפון חדש או אחרי מחיקה: מביא לכאן את הגיבוי האחרון שבחשבון ({source.label}, {formatDay(source.at.slice(0, 10))}), והמכשיר הזה הופך למכשיר שמגבה.</p>
              {!confirmRestore && <button className="btn light" disabled={busy} onClick={() => setConfirmRestore(true)}>שחזור מהחשבון</button>}
              {confirmRestore && (
                <div className="card" style={{ borderColor: 'var(--danger)', gap: 10 }}>
                  <span className="bold">לשחזר? כל מה שיש עכשיו במכשיר הזה יוחלף בגיבוי.</span>
                  <div className="row">
                    <button className="btn danger" style={{ flex: 1 }} disabled={busy}
                      onClick={() => run(() => restoreFromAccount(restoreBackup), 'השחזור נכשל. שום דבר במכשיר לא השתנה.')}>כן, לשחזר</button>
                    <button className="btn light" onClick={() => setConfirmRestore(false)}>ביטול</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}
