import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useFeed } from '../lib/feeds'
import { colorOf } from '../lib/derive'
import { formatDay, todayISO } from '../lib/dates'
import { blankActivity, fromIdea, totalMinutes } from '../lib/activities'
import { allItems, newItems } from '../lib/drop'
import type { Activity } from '../lib/types'
import { DiscoverTabs } from '../components/ui'
import { Icon } from '../components/Icon'

const STATUS = { draft: 'טיוטה', ready: 'מוכנה', done: 'הועברה' } as const

export const openActivity = (id: string) => { location.hash = `#/activity?id=${id}` }

// The library of activities she prepared, and saved agent ideas waiting to become one
export function Activities() {
  const { activities, setActivities, partnerships, savedIdeas, calCategories, agentSettings, dropSeen } = useStore()
  const shl = useFeed('shlichut').feed
  const deals = useFeed('deals').feed
  const [filter, setFilter] = useState('all')
  const today = todayISO()
  const waiting = shl && deals ? newItems(allItems(shl.items, deals.items, agentSettings, today), dropSeen).length : 0

  const partner = (id?: string) => partnerships.find((p) => p.id === id)
  const catOf = (a: Activity) => calCategories.find((c) => c.id === a.work)
  const shown = activities.filter((a) => filter === 'all' || (filter === 'draft' ? a.status === 'draft' : a.partnershipId === filter))
  const groups = useMemo(() => {
    const isPast = (a: Activity) => a.status === 'done' || (!!a.date && a.date < today)
    return [
      { label: 'בקרוב', items: shown.filter((a) => a.date && !isPast(a)).sort((x, y) => x.date!.localeCompare(y.date!)) },
      { label: 'מוכנות לשימוש', items: shown.filter((a) => !a.date && !isPast(a)).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)) },
      { label: 'כבר העברת', items: shown.filter(isPast).sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')) },
    ].filter((g) => g.items.length)
  }, [shown, today])
  const builtFrom = new Set(activities.map((a) => a.fromIdeaId).filter(Boolean))
  const ideas = (shl?.items ?? []).filter((i) => savedIdeas.includes(i.id) && !builtFrom.has(i.id))

  const create = (a: Activity) => {
    setActivities((as) => [...as, a])
    openActivity(a.id)
  }
  const fromSaved = (id: string) => {
    const item = shl?.items.find((i) => i.id === id)
    if (!item) return
    const p = partnerships.find((x) => item.forPartnerships?.some((f) => f.id === x.id))
    create(fromIdea(item, p?.id, item.forPartnerships?.find((f) => f.id === p?.id)?.idea))
  }

  return (
    <main className="screen">
      <DiscoverTabs active="activities" newCount={waiting} />
      <div className="title-row">
        <h1>הפעילויות שלי</h1>
        <button className="icon-btn solid" aria-label="פעילות חדשה" onClick={() => create(blankActivity())}><Icon name="plus" size={20} stroke={2.2} /></button>
      </div>

      {(activities.length > 0) && (
        <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {[['all', 'הכל'], ...partnerships.map((p) => [p.id, p.name]), ['draft', 'טיוטות']].map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'on' : ''}`} style={{ flexShrink: 0 }} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      )}

      {activities.length === 0 && (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 24, gap: 10 }}>
          <span className="bold" style={{ fontSize: 17 }}>עוד אין פעילויות</span>
          <span className="muted">אפשר להתחיל מרעיון של הסוכן, או לבנות מאפס ממתודות.</span>
          <button className="btn" onClick={() => create(blankActivity())}>פעילות חדשה</button>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="col" style={{ gap: 6 }}>
          <span className="section-label">{g.label}</span>
          <div className="group">
            {g.items.map((a) => {
              const p = partner(a.partnershipId)
              const c = catOf(a)
              return (
                <a key={a.id} href={`#/activity?id=${a.id}`} className="group-row" style={{ alignItems: 'flex-start', paddingBlock: 12 }}>
                  <span className="dot8" style={{ marginTop: 8, background: c ? colorOf(c.color).dot : '#B8BCC3' }} />
                  <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{a.title || 'פעילות בלי שם'}</span>
                    <span className="small muted">{[p?.name, a.date ? formatDay(a.date) : 'בלי תאריך'].filter(Boolean).join(', ')}</span>
                    <span className="small bold" style={{ color: 'var(--ink2)' }}>{totalMinutes(a)} דקות, {a.methods.length === 1 ? 'מתודה אחת' : `${a.methods.length} מתודות`}</span>
                  </span>
                  <span className={`status-badge ${a.status}`}>{STATUS[a.status]}</span>
                </a>
              )
            })}
          </div>
        </section>
      ))}

      {ideas.length > 0 && (
        <section className="col" style={{ gap: 6 }}>
          <span className="section-label">רעיונות ששמרת מהסוכן</span>
          <div className="group">
            {ideas.map((i) => (
              <div key={i.id} className="group-row">
                <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>{i.title}</span>
                  <span className="small muted">{[i.category, i.when].filter(Boolean).join(', ')}{i.plan ? `, ${i.plan.methods.length} מתודות מוכנות` : ''}</span>
                </span>
                <button className="chip small on" onClick={() => fromSaved(i.id)}>לבנות פעילות</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
