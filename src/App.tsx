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

const routes: Record<string, () => React.JSX.Element> = {
  home: Home,
  'self/deals': Deals,
  'self/budget': Budget,
  'self/contacts': Contacts,
  shlichut: Shlichut,
  calendar: Calendar,
  tasks: Tasks,
}

const currentRoute = () => {
  const r = location.hash.replace(/^#\/?/, '')
  return r in routes ? r : 'home'
}

export default function App() {
  const [route, setRoute] = useState(currentRoute)
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
        <Screen />
      </div>
      <Nav section={route.split('/')[0]} />
    </StoreProvider>
  )
}
