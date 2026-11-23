import { Icon, type IconName } from './Icon'
import { useStore } from '../lib/store'
import { useFeed } from '../lib/feeds'
import { allItems, newItems } from '../lib/drop'
import { todayISO } from '../lib/dates'

// Five tabs. Screens that are not tabs belong to the tab they are reached from.
const TAB_OF: Record<string, string> = {
  home: 'home', settings: 'home', profile: 'home', account: 'home', recap: 'home', wrapped: 'home',
  calendar: 'calendar',
  tasks: 'tasks',
  drop: 'discover', shlichut: 'discover', 'self/deals': 'discover', activities: 'discover', activity: 'discover',
  'self/contacts': 'self', 'self/important': 'self', 'self/budget': 'self', journal: 'self',
}

const items: { href: string; tab: string; label: string; icon: IconName }[] = [
  { href: '#/home', tab: 'home', label: 'היום', icon: 'home' },
  { href: '#/calendar', tab: 'calendar', label: 'יומן', icon: 'calendar' },
  { href: '#/tasks', tab: 'tasks', label: 'משימות', icon: 'tasks' },
  { href: '#/drop', tab: 'discover', label: 'גילויים', icon: 'compass' },
  { href: '#/self/contacts', tab: 'self', label: 'לעצמי', icon: 'user' },
]

export const tabOf = (route: string) => TAB_OF[route] ?? 'home'

export function Nav({ route }: { route: string }) {
  const active = tabOf(route)
  const { agentSettings, dropSeen } = useStore()
  const deals = useFeed('deals').feed
  const shl = useFeed('shlichut').feed
  const waiting = deals && shl ? newItems(allItems(shl.items, deals.items, agentSettings, todayISO()), dropSeen).length : 0
  return (
    <nav className="nav" aria-label="ניווט ראשי">
      <div className="nav-inner">
        {items.map((i) => (
          <a key={i.tab} href={i.href} className={active === i.tab ? 'on' : ''} aria-current={active === i.tab ? 'page' : undefined}>
            <Icon name={i.icon} size={26} stroke={active === i.tab ? 2.4 : 1.8} />
            {i.label}
            {i.tab === 'discover' && waiting > 0 && active !== 'discover' && (
              <span className="badge" aria-label={`${waiting} חדשים`}>{waiting > 99 ? '99+' : waiting}</span>
            )}
          </a>
        ))}
      </div>
    </nav>
  )
}
