import { useState } from 'react'
import { useStore, newId } from '../lib/store'
import { budgetSummary } from '../lib/derive'
import { MONTHS, formatDay, fromISO, todayISO } from '../lib/dates'
import { Bar, Fab, SelfTabs, Sheet, money } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Category } from '../lib/types'

export function Budget() {
  const { settings, setSettings, categories, setCategories, expenses, setExpenses } = useStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Category | 'total' | null>(null)
  const today = todayISO()
  const b = budgetSummary(expenses, settings.monthlyBudget, today)
  const now = fromISO(today)
  const planned = categories.reduce((s, c) => s + c.plan, 0)
  const spentIn = (id: string) => b.thisMonth.filter((e) => e.categoryId === id).reduce((s, e) => s + e.amount, 0)
  const recent = [...b.thisMonth].sort((a, z) => z.date.localeCompare(a.date)).slice(0, 8)

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
        <Bar pct={(b.spent / settings.monthlyBudget) * 100} color="var(--ink)" />
        <div className="between small muted">
          <span>נשאר: <b style={{ color: b.remaining < 0 ? 'var(--danger)' : 'var(--ok)' }}>{money(b.remaining)}</b></span>
          <span>קצב יומי מומלץ: <b style={{ color: 'var(--ink)' }}>{money(b.perDay)}</b></span>
        </div>
      </section>

      <section className="col">
        <div className="between">
          <h2>לפי קטגוריה</h2>
          <span className="muted small">{planned < settings.monthlyBudget ? `לא מתוכנן: ${money(settings.monthlyBudget - planned)}` : planned > settings.monthlyBudget ? `תכננת ${money(planned - settings.monthlyBudget)} יותר מהמלגה` : ''}</span>
        </div>
        <div className="card" style={{ gap: 0, padding: '4px 16px' }}>
          {categories.map((c, i) => {
            const spent = spentIn(c.id)
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
      </section>

      <section className="col" style={{ gap: 8 }}>
        <h2>הוצאות אחרונות</h2>
        {recent.length === 0 && <p className="empty">עוד לא הוספת הוצאות החודש</p>}
        {recent.map((e) => (
          <div key={e.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: '8px 14px' }}>
            <span className="col" style={{ gap: 0, flex: 1 }}>
              <span>{e.note || categories.find((c) => c.id === e.categoryId)?.name}</span>
              <span className="muted small">{formatDay(e.date)} · {categories.find((c) => c.id === e.categoryId)?.name}</span>
            </span>
            <span className="bold ltr">-{money(e.amount)}</span>
            <button className="icon-btn" style={{ border: 'none' }} aria-label="מחק הוצאה"
              onClick={() => setExpenses((xs) => xs.filter((x) => x.id !== e.id))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
      </section>

      <Fab label="הוצאה" onClick={() => setAdding(true)} />

      {adding && (
        <Sheet title="הוצאה חדשה" onClose={() => setAdding(false)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const f = new FormData(ev.currentTarget)
            const amount = Number(f.get('amount'))
            if (!amount) return
            setExpenses((xs) => [...xs, { id: newId(), amount, categoryId: String(f.get('cat')), note: String(f.get('note') || ''), date: String(f.get('date')) }])
            setAdding(false)
          }}>
            <label className="field">סכום ($)<input name="amount" type="number" inputMode="decimal" step="0.01" min="0" required autoFocus /></label>
            <label className="field">קטגוריה
              <select name="cat">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="field">על מה?<input name="note" placeholder="למשל: סופר" /></label>
            <label className="field">תאריך<input name="date" type="date" defaultValue={today} required /></label>
            <button className="btn block" type="submit">שמור</button>
          </form>
        </Sheet>
      )}

      {editing === 'total' && (
        <Sheet title="מלגה חודשית" onClose={() => setEditing(null)}>
          <form className="col" style={{ gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault()
            const v = Number(new FormData(ev.currentTarget).get('total'))
            if (v > 0) setSettings((s) => ({ ...s, monthlyBudget: v }))
            setEditing(null)
          }}>
            <label className="field">סכום חודשי ($)<input name="total" type="number" inputMode="decimal" defaultValue={settings.monthlyBudget} required /></label>
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
