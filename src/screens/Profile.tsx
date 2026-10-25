import { useState } from 'react'
import { useStore } from '../lib/store'
import { isAway } from '../lib/places'
import { INTERESTS, type Profile as ProfileData } from '../lib/types'
import { PlacePicker } from '../components/PlacePicker'
import { Icon } from '../components/Icon'
import { money } from '../components/ui'

export function Profile() {
  const { settings, setSettings, profile, setProfile, agentSettings, publishAgentSettings } = useStore()
  const [draft, setDraft] = useState<ProfileData>(profile)
  const [name, setName] = useState(settings.name)
  const [budget, setBudget] = useState(String(settings.monthlyBudget))
  const [status, setStatus] = useState('')
  const set = (patch: Partial<ProfileData>) => setDraft((d) => ({ ...d, ...patch }))

  const save = async () => {
    setProfile(draft)
    setSettings((s) => ({ ...s, name: name.trim() || s.name, monthlyBudget: Number(budget) > 0 ? Number(budget) : s.monthlyBudget }))
    // What the discovery agent needs from the profile; while on vacation, keep searching where Gili is
    const away = isAway(agentSettings)
    const interests = [...draft.interests, ...draft.interestsExtra.split(',').map((x) => x.trim()).filter(Boolean)]
    setStatus('שומר…')
    try {
      const published = await publishAgentSettings({
        ...agentSettings,
        age: draft.age,
        interests,
        homeBase: draft.home,
        ...(away ? {} : { home: draft.home.name, lat: draft.home.lat, lng: draft.home.lng, awayUntil: undefined }),
      })
      setStatus(published ? 'נשמר. הסוכן ישתמש בזה בעדכון של מחר בבוקר.' : 'נשמר בטלפון. כדי שהסוכן יקבל את זה, הוסיפו טוקן GitHub בגילויים בזול ← התאמה.')
    } catch {
      setStatus('נשמר בטלפון, אבל השמירה ב-GitHub נכשלה. בדקו את הטוקן.')
    }
  }

  const spendable = (Number(budget) || 0) - (draft.savingGoal ?? 0)

  return (
    <main className="screen">
      <header className="row">
        <a href="#/home" className="icon-btn" aria-label="חזרה"><Icon name="chevronR" /></a>
        <h1>הפרופיל שלי</h1>
      </header>
      <p className="muted small">סוכן הגילויים משתמש בגיל, במקום המגורים ובתחביבים כדי למצוא דברים שמתאימים לך.</p>

      <section className="card" style={{ gap: 12 }}>
        <label className="field">שם<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">גיל
          <input type="number" inputMode="numeric" min="16" max="99" value={draft.age ?? ''}
            onChange={(e) => set({ age: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <PlacePicker label="מקום מגורים" value={draft.home} onPick={(home) => set({ home })} />
      </section>

      <section className="card" style={{ gap: 12 }}>
        <h2>כסף</h2>
        <label className="field">תקציב חודשי (מלגה + הכנסות, $)
          <input type="number" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className="field">יעד חיסכון חודשי ($)
          <input type="number" inputMode="decimal" min="0" value={draft.savingGoal ?? ''}
            onChange={(e) => set({ savingGoal: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        {draft.savingGoal ? <span className="small muted">נשאר להוציא בחודש אחרי החיסכון: <b>{money(spendable)}</b></span> : null}
      </section>

      <section className="card" style={{ gap: 12 }}>
        <h2>תחביבים ותחומי עניין</h2>
        <div className="chips" style={{ gap: 6 }}>
          {INTERESTS.map((t) => {
            const on = draft.interests.includes(t)
            return <button key={t} className={`chip small ${on ? 'on' : ''}`} aria-pressed={on}
              onClick={() => set({ interests: on ? draft.interests.filter((x) => x !== t) : [...draft.interests, t] })}>{t}</button>
          })}
        </div>
        <label className="field">עוד משהו? (מופרד בפסיקים, למשל: סלסה, טניס שולחן)
          <input value={draft.interestsExtra} onChange={(e) => set({ interestsExtra: e.target.value })} />
        </label>
      </section>

      <button className="btn block" onClick={save}>שמור פרופיל</button>
      {status && <p className="small">{status}</p>}
      <p className="muted small">
        גיל, עיר ותחביבים נשמרים בקובץ ההגדרות של הסוכן ב-GitHub (ציבורי). השם, התקציב ויעד החיסכון נשארים רק בטלפון.
      </p>
    </main>
  )
}
