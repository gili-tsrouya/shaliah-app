import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { budgetSummary, spentInCategory } from '../lib/derive'
import { MONTHS, formatDay, fromISO, todayISO } from '../lib/dates'
import { Bar, Fab, SelfTabs, Sheet, money } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Category } from '../lib/types'

export function Budget() {
  const { settings, setSettings, categories, setCategories, expenses, setExpenses, owed, setOwed } = useStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Category | 'total' | null>(null)
  const today = todayISO()
  const b = budgetSummary(expenses, settings.monthlyBudget, today)
  const now = fromISO(today)
  const planned = categories.reduce((s, c) => s + c.plan, 0)
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'אחר'
  const recent = [...b.thisMonth].sort((a, z) => z.date.localeCompare(a.date)).slice(0, 8)

  const receive = (id: string) => {
    const o = owed.find((x) => x.id === id)
    if (!o) return
    setExpenses((xs) => [...xs, { id: newId(), amount: o.amount, categoryId: o.categoryId, note: `${o.who} החזיר/ה — ${o.what}`, date: today, refund: true }])
    setOwed((os) => os.filter((x) => x.id !== id))
  }

  return (
    <main className="screen">
      <h1>לעצמי</h1>
      <SelfTabs active="budget" />

      <section className="card" style={{ gap: 10, padding: 16 }}>
        <div className="between">
          <span className="bold">{MONTHS[now.getMonth()]} {now.getFullYear()}</span>
          <button className="chip" onClick={() => setEditing('total')}>מלגה: {money(settings.monthlyBudget)} <Icon name="edit" size={14} /></button>
        </div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="big-num ltr" style={{ fontSize: 34 }}>{money(b.spent)}</span>
          <span className="muted">הוצאת עד עכשיו</span>
        </div>
        {b.refunds > 0 && <span className="small" style={{ color: 'var(--ok)' }}>כולל {money(b.refunds)} שקיבלת בחזרה</span>}
        <Bar pct={(b.spent / settings.monthlyBudget) * 100} color={b.spent > settings.monthlyBudget ? 'var(--danger)' : 'var(--ink)'} />
        <div className="between small muted">
          <span>נשאר: <b style={{ color: b.remaining < 0 ? 'var(--danger)' : 'var(--ok)' }}>{money(b.remaining)}</b></span>
          <span>קצב יומי מומלץ: <b style={{ color: 'var(--ink)' }}>{money(b.perDay)}</b></span>
        </div>
      </section>

      <section className="col">
        <h2>לפי קטגוריה</h2>
        <div className="card" style={{ gap: 0, padding: '4px 16px' }}>
          {categories.map((c, i) => {
            const spent = spentInCategory(b.thisMonth, c.id)
            const pct = c.plan ? (spent / c.plan) * 100 : 0
            return (
              <button key={c.id} onClick={() => setEditing(c)} aria-label={`עריכת ${c.name}`}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: i < categories.length - 1 ? '1px solid #EEF1F6' : 'none' }}>
                <span className="between" style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="muted ltr">{money(spent)} / {money(c.plan)}</span>
                </span>
                <Bar pct={pct} color={pct >= 85 ? 'var(--warn)' : 'var(--primary)'} />
              </button>
            )
          })}
        </div>
        <button className="btn light" onClick={() => setEditing({ id: '', name: '', plan: 0 })}>+ קטגוריה חדשה</button>
        <span className="muted small">
          {planned === settings.monthlyBudget ? 'כל המלגה מחולקת לקטגוריות'
            : planned < settings.monthlyBudget ? `לא מתוכנן עדיין: ${money(settings.monthlyBudget - planned)}`
            : `תכננת ${money(planned - settings.monthlyBudget)} יותר מהמלגה`}
        </span>
      </section>

      <section className="col" style={{ gap: 8 }}>
        <h2>חייבים לי</h2>
        {owed.length === 0 && <span className="muted small">אף אחד לא חייב לך כרגע</span>}
        {owed.map((o) => (
          <div key={o.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '8px 8px 8px 14px', borderStyle: 'dashed' }}>
            <span className="col" style={{ gap: 0, flex: 1 }}>
              <span style={{ fontWeight: 500 }}>{o.who}</span>
              <span className="muted small">{o.what}</span>
            </span>
            <span className="bold ltr muted">{money(o.amount)}</span>
            <button className="btn" style={{ minHeight: 36, padding: '0 10px', fontSize: 13, background: 'var(--personal-bg)', color: 'var(--ok)' }} onClick={() => receive(o.id)}>קיבלתי</button>
          </div>
        ))}
      </section>

      <section className="col" style={{ gap: 8 }}>
        <h2>תנועות אחרונות</h2>
        {recent.length === 0 && <p className="empty">עוד לא הוספת הוצאות החודש</p>}
        {recent.map((e) => (
          <div key={e.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '8px 14px' }}>
            <span className="col" style={{ gap: 0, flex: 1 }}>
              <span>{e.note || catName(e.categoryId)}</span>
              <span className="muted small">{formatDay(e.date)} · {e.refund ? 'החזר' : catName(e.categoryId)}</span>
            </span>
            <span className="bold ltr" style={{ color: e.refund ? 'var(--ok)' : undefined }}>{e.refund ? '+' : '-'}{money(e.amount)}</span>
            <button className="icon-btn" style={{ border: 'none' }} aria-label="מחק"
              onClick={() => setExpenses((xs) => xs.filter((x) => x.id !== e.id))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </section>

      <Fab label="הוצאה" onClick={() => setAdding(true)} />

      {adding && <AddSheet today={today} onClose={() => setAdding(false)} />}

      {editing === 'total' && (
        <Sheet title="מלגה חודשית" onClose={() => setEditing(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const v = Number(new FormData(ev.currentTarget).get('total'))
            if (v > 0) setSettings((s) => ({ ...s, monthlyBudget: v }))
            setEditing(null)
          }}>
            <label className="field">כמה נכנס בחודש? (מלגה + הכנסות נוספות, $)<input name="total" type="number" inputMode="decimal" defaultValue={settings.monthlyBudget} required /></label>
            <button className="btn block" type="submit">שמור</button>
          </form>
        </Sheet>
      )}

      {editing && editing !== 'total' && (
        <Sheet title={editing.id ? 'עריכת קטגוריה' : 'קטגוריה חדשה'} onClose={() => setEditing(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const next = { id: editing.id || newId(), name: String(f.get('name')), plan: Number(f.get('plan')) || 0 }
            setCategories((cs) => (editing.id ? cs.map((c) => (c.id === editing.id ? next : c)) : [...cs, next]))
            setEditing(null)
          }}>
            <label className="field">שם<input name="name" defaultValue={editing.name} required /></label>
            <label className="field">תקציב חודשי ($)<input name="plan" type="number" inputMode="decimal" defaultValue={editing.plan || ''} required /></label>
            <button className="btn block" type="submit">שמור</button>
            {editing.id && (
              <button type="button" className="btn danger block" onClick={() => {
                setCategories((cs) => cs.filter((c) => c.id !== editing.id))
                setEditing(null)
              }}>מחק קטגוריה</button>
            )}
          </form>
        </Sheet>
      )}
    </main>
  )
}

// One sheet for both: a new expense (optionally someone owes part of it) or money that came back
function AddSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const { categories, setExpenses, owed, setOwed } = useStore()
  const [refund, setRefund] = useState(false)
  const [amount, setAmount] = useState('')
  const [split, setSplit] = useState(false)
  const [share, setShare] = useState<'half' | 'third' | 'custom'>('half')
  const [fromOwed, setFromOwed] = useState<string | null>(null)
  const value = Number(amount) || 0
  const shareValue = share === 'half' ? value / 2 : share === 'third' ? value / 3 : 0

  return (
    <Sheet title={refund ? 'קיבלתי כסף בחזרה' : 'הוצאה חדשה'} onClose={onClose}>
      <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
        ev.preventDefault()
        const f = new FormData(ev.currentTarget)
        if (!value) return
        const categoryId = String(f.get('cat'))
        const note = String(f.get('note') || '')
        const date = String(f.get('date'))
        setExpenses((xs) => [...xs, { id: newId(), amount: value, categoryId, note, date, refund: refund || undefined }])
        if (refund && fromOwed) setOwed((os) => os.filter((o) => o.id !== fromOwed))
        if (!refund && split) {
          const who = String(f.get('who') || '').trim() || 'מישהו'
          const part = share === 'custom' ? Number(f.get('custom')) || 0 : Math.round(shareValue * 100) / 100
          if (part > 0) setOwed((os) => [...os, { id: newId(), who, what: note || categories.find((c) => c.id === categoryId)?.name || '', amount: part, categoryId, date }])
        }
        onClose()
      }}>
        <label className="field" style={{ alignItems: 'center' }}>{refund ? 'כמה קיבלת? ($)' : 'כמה הוצאת? ($)'}
          <input name="amount" type="number" inputMode="decimal" step="0.01" min="0" required autoFocus value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ textAlign: 'center', fontFamily: 'Rubik, sans-serif', fontSize: 28, fontWeight: 700, color: refund ? 'var(--ok)' : undefined, width: '100%' }} />
        </label>
        <label className="field">{refund ? 'לקזז מקטגוריה' : 'קטגוריה'}
          <select name="cat" defaultValue={fromOwed ? owed.find((o) => o.id === fromOwed)?.categoryId : undefined}
            key={fromOwed ?? 'none'}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="field">{refund ? 'ממי ועל מה?' : 'על מה?'}
          <input name="note" placeholder={refund ? 'למשל: נועה החזירה על הפיצה' : 'למשל: פיצה עם נועה'} />
        </label>
        <label className="field">תאריך<input name="date" type="date" defaultValue={today} required /></label>

        {!refund && (
          <div className="card" style={{ background: split ? 'var(--ground)' : undefined, gap: 10 }}>
            <button type="button" role="switch" aria-checked={split} onClick={() => setSplit(!split)}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="col" style={{ gap: 0, flex: 1 }}>
                <span className="bold">מישהו חייב לי חלק מזה?</span>
                <span className="muted small">לא חובה · יופיע ב"חייבים לי" עד שיחזירו</span>
              </span>
              <span style={{ width: 46, height: 28, borderRadius: 14, position: 'relative', flexShrink: 0, background: split ? 'var(--ok)' : '#C3CAD6' }}>
                <span style={{ position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, background: '#fff', insetInlineStart: split ? 21 : 3 }} />
              </span>
            </button>
            {split && (
              <>
                <input name="who" placeholder="מי? (למשל: נועה)" aria-label="מי חייב"
                  style={{ minHeight: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 16 }} />
                <div className="grid3" style={{ gap: 6 }}>
                  {([['half', `חצי${value ? ' · ' + money(value / 2) : ''}`], ['third', `שליש${value ? ' · ' + money(value / 3) : ''}`], ['custom', 'סכום אחר']] as const).map(([k, l]) => (
                    <button type="button" key={k} className={`chip ${share === k ? 'on' : ''}`} style={{ justifyContent: 'center', padding: '0 6px' }}
                      aria-pressed={share === k} onClick={() => setShare(k)}>{l}</button>
                  ))}
                </div>
                {share === 'custom' && <input name="custom" type="number" inputMode="decimal" step="0.01" placeholder="כמה חייבים לך? ($)" aria-label="סכום שחייבים לך"
                  style={{ minHeight: 42, border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 16 }} />}
              </>
            )}
          </div>
        )}

        {refund && owed.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small bold muted">מתוך "חייבים לי" (לא חובה)</span>
            {owed.map((o) => (
              <button type="button" key={o.id} aria-pressed={fromOwed === o.id}
                onClick={() => { const on = fromOwed !== o.id; setFromOwed(on ? o.id : null); if (on) setAmount(String(o.amount)) }}
                className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '10px 12px', textAlign: 'start', ...(fromOwed === o.id ? { background: 'var(--personal-bg)', borderColor: 'var(--ok)', color: 'var(--ok)' } : {}) }}>
                <span style={{ flex: 1 }}>{o.who} · {o.what}</span>
                <span className="bold ltr">{money(o.amount)}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={() => { setRefund(!refund); setFromOwed(null) }}
          style={{ all: 'unset', cursor: 'pointer', alignSelf: 'center', minHeight: 36, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--ok)' }}>
          <Icon name="undo" size={16} /> {refund ? 'זו בעצם הוצאה' : 'זה כסף שקיבלתי בחזרה? (החזר)'}
        </button>
        <button className="btn block" type="submit" style={{ minHeight: 52, background: refund ? 'var(--ok)' : undefined }}>{refund ? 'שמור החזר' : 'שמור הוצאה'}</button>
      </form>
    </Sheet>
  )
}
