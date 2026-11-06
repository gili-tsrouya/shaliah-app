// Morning "who to call" notification, loaded into the app's service worker (see vite.config.ts).
// The server only sends a wake-up at the reminder time; the names are worked out here, on the phone,
// from the copy of the stay-in-touch list the app keeps in IndexedDB. Contacts never leave the phone.

const PUSH_DB = 'shaliach-push'
const PUSH_STORE = 'kv'
const CONTACTS_URL = new URL('./#/self/contacts', self.registration.scope).href

function readPeople() {
  return new Promise((resolve) => {
    const open = indexedDB.open(PUSH_DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(PUSH_STORE)
    open.onerror = () => resolve([])
    open.onsuccess = () => {
      const get = open.result.transaction(PUSH_STORE, 'readonly').objectStore(PUSH_STORE).get('people')
      get.onsuccess = () => resolve(Array.isArray(get.result) ? get.result : [])
      get.onerror = () => resolve([])
    }
  })
}

const pad = (n) => String(n).padStart(2, '0')
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Calendar days since 1 Jan 1970, the same whatever the time zone
const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// Same rules as the stay-in-touch screen (nextCallDate in src/lib/calls.ts): due when the chosen rhythm
// has passed, or on the next fixed call day; most neglected first
function nextCallDay(p) {
  const last = dayNumber(p.lastTalk)
  if (!Array.isArray(p.callDays) || !p.callDays.length || p.everyDays <= 1) return last + p.everyDays
  let d = last + Math.max(1, p.everyDays - 3)
  // day number 0 (1 Jan 1970) was a Thursday
  for (let i = 0; i < 7 && !p.callDays.includes((d + 4) % 7); i++) d++
  return d
}

function dueToday(people, today) {
  const t = dayNumber(today)
  return people
    .filter((p) => p && p.name && p.everyDays > 0 && p.lastTalk)
    .map((p) => ({ name: p.name, ago: t - dayNumber(p.lastTalk), every: p.everyDays, due: nextCallDay(p) - t }))
    .filter((p) => p.due <= 0)
    .sort((a, b) => b.ago / b.every - a.ago / a.every)
    .map((p) => p.name)
}

function messageFor(names) {
  if (!names.length) return 'דיברת עם כולם בזמן. אפשר בכל זאת להרים טלפון למישהו שאוהבים.'
  const shown = names.slice(0, 4).join(', ')
  return `היום כדאי לדבר עם: ${shown}${names.length > 4 ? ` ועוד ${names.length - 4}` : ''}`
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const names = dueToday(await readPeople(), localDay(new Date()))
    // iPhone requires every push to show a notification, so there is always one
    await self.registration.showNotification('שומרים על קשר', {
      body: messageFor(names),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'morning-calls',
      data: { url: CONTACTS_URL },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || CONTACTS_URL
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = tabs.find((c) => c.url.startsWith(self.registration.scope))
    if (open) {
      await open.focus()
      return open.navigate(url)
    }
    return self.clients.openWindow(url)
  })())
})
