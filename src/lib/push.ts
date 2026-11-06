// Morning "who to call" notifications.
// A daily job in the private data repo sends a wake-up push at the reminder time; the service worker
// (public/push-sw.js) then works out who is due from the copy of the list kept here in IndexedDB.
// The data repo only gets the push subscription, the reminder time and the time zone, never contacts.
import type { Person } from './types'

// Public half of the key the daily job signs pushes with; public by design
export const VAPID_PUBLIC_KEY = 'BPMojbeX8jFqAj8uTqb2UOeHHCjS9oVd8un7HlHbucf21BP_5BcVoqZZ9ktqYyVFoAG4VTLJLmnEWQV1JZCrHZM'

const DATA_REPO = 'Gili-tsrouya/shaliah-data'
const CONFIG_URL = `https://api.github.com/repos/${DATA_REPO}/contents/push/config.json`

export type PushSupport = 'ok' | 'install' | 'unsupported'

// iPhone only allows notifications for the app opened from the home screen
export function pushSupport(): PushSupport {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
    return /iPhone|iPad/.test(navigator.userAgent) && !standalone ? 'install' : 'unsupported'
  }
  if (!('PushManager' in window)) return 'unsupported'
  return 'ok'
}

// What the service worker needs to name people: nothing more
export function mirrorPeople(people: Person[]) {
  const slim = people.map((p) => ({ name: p.name, everyDays: p.everyDays, lastTalk: p.lastTalk }))
  try {
    const open = indexedDB.open('shaliach-push', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('kv')
    open.onsuccess = () => open.result.transaction('kv', 'readwrite').objectStore('kv').put(slim, 'people')
  } catch {
    // no IndexedDB (private mode): the notification then says there is no one due
  }
}

const keyBytes = (b64url: string) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

// The only file this writes, and only in the private data repo
async function saveConfig(token: string, config: object | null) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const current = await fetch(CONFIG_URL, { headers, cache: 'no-store' })
  if (current.status === 401 || current.status === 403) throw new Error('token')
  const sha = current.ok ? ((await current.json()) as { sha: string }).sha : undefined
  if (!config && !sha) return
  const r = await fetch(CONFIG_URL, {
    method: config ? 'PUT' : 'DELETE',
    headers,
    body: JSON.stringify(config
      ? { message: 'Update morning reminder', content: toBase64(JSON.stringify(config, null, 2) + '\n'), sha }
      : { message: 'Turn off morning reminder', sha }),
  })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 || r.status === 404 ? 'token' : `GitHub ${r.status}`)
}

async function subscription() {
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription())
    ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
}

const configFor = async (reminderTime: string) => ({
  subscription: (await subscription()).toJSON(),
  reminderTime,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  updatedAt: new Date().toISOString(),
})

// Must be called from a tap: iPhone only shows the permission question then
export async function enablePush(token: string, reminderTime: string) {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
  await saveConfig(token, await configFor(reminderTime))
}

export async function updatePushTime(token: string, reminderTime: string) {
  await saveConfig(token, await configFor(reminderTime))
}

export async function disablePush(token: string) {
  const reg = await navigator.serviceWorker.ready
  await (await reg.pushManager.getSubscription())?.unsubscribe()
  await saveConfig(token, null)
}

// A notification shown right away, to check that the phone displays them
export async function testNotification() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('שומרים על קשר', { body: 'ככה תיראה התזכורת של הבוקר.', icon: 'icon-192.png', tag: 'morning-calls-test' })
}
