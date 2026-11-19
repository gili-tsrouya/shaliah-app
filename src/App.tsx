import { useEffect, useState } from 'react'
import { StoreProvider } from './lib/store'
import { Nav } from './components/Nav'
import { Home } from './screens/Home'
import { Deals } from './screens/Deals'
import { Budget } from './screens/Budget'
import { Contacts } from './screens/Contacts'
import { Shlichut } from './screens/Shlichut'
import { Calendar } from './screens/Calendar'
import { Tasks } from './screens/Tasks'
import { Settings } from './screens/Settings'
import { Profile } from './screens/Profile'
import { Account } from './screens/Account'
import { Drop } from './screens/Drop'
import { Journal } from './screens/Journal'
import { Recap } from './screens/Recap'
import { Wrapped } from './screens/Wrapped'
import { Activities } from './screens/Activities'
import { Activity, ActivityPrint } from './screens/Activity'
import { backupIfNeeded, maybeSignedIn } from './lib/cloud'
import { ErrorBoundary } from './components/ErrorBoundary'

const routes: Record<string, () => React.JSX.Element> = {
  home: Home,
  'self/deals': Deals,
  'self/budget': Budget,
  'self/contacts': Contacts,
  shlichut: Shlichut,
  calendar: Calendar,
  tasks: Tasks,
  settings: Settings,
  profile: Profile,
  account: Account,
  drop: Drop,
  journal: Journal,
  recap: Recap,
  wrapped: Wrapped,
  activities: Activities,
  activity: Activity,
  'activity-print': ActivityPrint,
}

const currentRoute = () => {
  const r = location.hash.replace(/^#\/?/, '').replace(/\?.*$/, '')
  return r in routes ? r : 'home'
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    // After a Google sign-in the browser comes back to the start page: go to the screen that asked for it
    // returning from connecting Google Calendar: drop the marker from the address
    if (new URLSearchParams(location.search).has('google')) history.replaceState(null, '', location.pathname + location.hash)
    const back = sessionStorage.getItem('shaliach-return')
    if (back) {
      sessionStorage.removeItem('shaliach-return')
      location.hash = back
    }
  }, [])
  // Automatic backup to the account, for a signed-in device: shortly after opening, every few minutes
  // while the app is open, and when it is put away. It does nothing when nothing changed.
  useEffect(() => {
    if (!maybeSignedIn()) return
    const run = () => { backupIfNeeded().catch(() => {}) }
    const first = setTimeout(run, 8000)
    const every = setInterval(run, 3 * 60_000)
    const onHide = () => { if (document.visibilityState === 'hidden') run() }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])
  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const Screen = routes[route]
  return (
    <StoreProvider>
      <div className="app">
        <ErrorBoundary key={route} where={route}><Screen /></ErrorBoundary>
      </div>
      {route !== 'activity-print' && <Nav route={route} />}
    </StoreProvider>
  )
}
