import { Icon, type IconName } from './Icon'

const items: { href: string; match: string; label: string; icon: IconName }[] = [
  { href: '#/home', match: 'home', label: 'בית', icon: 'home' },
  { href: '#/self/deals', match: 'self', label: 'לעצמי', icon: 'heart' },
  { href: '#/shlichut', match: 'shlichut', label: 'שליחות', icon: 'star' },
  { href: '#/calendar', match: 'calendar', label: 'יומן', icon: 'calendar' },
  { href: '#/tasks', match: 'tasks', label: 'משימות', icon: 'board' },
]

export function Nav({ section }: { section: string }) {
  return (
    <nav className="nav" aria-label="ניווט ראשי">
      <div className="nav-inner">
        {items.map((i) => (
          <a key={i.match} href={i.href} className={section === i.match ? 'on' : ''}
            aria-current={section === i.match ? 'page' : undefined}>
            <Icon name={i.icon} size={24} />
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
