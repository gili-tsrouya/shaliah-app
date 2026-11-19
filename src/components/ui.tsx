import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2>{title}</h2>
          <button className="icon-btn" style={{ border: 0, background: 'var(--ground)' }} aria-label="סגור" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Fab({ label, onClick, icon = 'plus' }: { label: string; onClick: () => void; icon?: IconName }) {
  return (
    <button className="fab" onClick={onClick}>
      <Icon name={icon} size={18} stroke={2.5} />
      {label}
    </button>
  )
}

// לעצמי: three parts under one tab
export function SelfTabs({ active }: { active: 'contacts' | 'budget' | 'journal' }) {
  const tabs = [
    { id: 'contacts', label: 'שומרים קשר', href: '#/self/contacts' },
    { id: 'budget', label: 'תקציב', href: '#/self/budget' },
    { id: 'journal', label: 'זיכרונות', href: '#/journal' },
  ] as const
  return (
    <nav className="segmented" aria-label="לעצמי">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} className={t.id === active ? 'on' : ''} aria-current={t.id === active ? 'page' : undefined}>{t.label}</a>
      ))}
    </nav>
  )
}

// גילויים: what is new, everything, and the activities built from it
export function DiscoverTabs({ active, newCount }: { active: 'new' | 'all' | 'activities'; newCount?: number }) {
  const tabs = [
    { id: 'new', label: newCount ? `חדש ${newCount}` : 'חדש', href: '#/drop' },
    { id: 'all', label: 'הכל', href: '#/drop?all' },
    { id: 'activities', label: 'הפעילויות שלי', href: '#/activities' },
  ] as const
  return (
    <nav className="segmented" aria-label="גילויים">
      {tabs.map((t) => (
        <a key={t.id} href={t.href} className={t.id === active ? 'on' : ''} aria-current={t.id === active ? 'page' : undefined}>{t.label}</a>
      ))}
    </nav>
  )
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="bar" role="presentation">
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

// "< back" at the top of a screen that is not a tab of its own
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="back-link"><Icon name="chevronR" size={22} stroke={2.2} />{label}</a>
  )
}
