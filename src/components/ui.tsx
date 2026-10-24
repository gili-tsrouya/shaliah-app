import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="סגור" onClick={onClose}>✕</button>
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

export function SelfTabs({ active }: { active: 'deals' | 'budget' | 'contacts' }) {
  const tabs = [
    { id: 'deals', label: 'גילויים בזול' },
    { id: 'budget', label: 'תקציב' },
    { id: 'contacts', label: 'שומרים קשר' },
  ] as const
  return (
    <nav className="segmented" aria-label="לעצמי">
      {tabs.map((t) => (
        <a key={t.id} href={`#/self/${t.id}`} className={t.id === active ? 'on' : ''}
          aria-current={t.id === active ? 'page' : undefined}>{t.label}</a>
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
