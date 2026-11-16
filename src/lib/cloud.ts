// The account in the cloud (Supabase). It exists only in builds that are given the project address and
// its public key; in every other build this file does nothing and the app works from the phone alone.
// The key here is the publishable one: it identifies the project and grants nothing by itself. What a
// signed-in person may read or change is decided by the database rules, per user.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { buildBackup } from './backup'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const cloudAvailable = Boolean(URL_ && KEY)
// Codes by email need a mail service connected to the project; until then only Google sign-in is offered
export const emailSignIn = import.meta.env.VITE_EMAIL_SIGNIN === '1'

let client: Promise<SupabaseClient> | null = null
// Loaded on first use, so phones that never open the account screen do not download it
export function cloud(): Promise<SupabaseClient> {
  if (!cloudAvailable) return Promise.reject(new Error('cloud is not configured in this build'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'shaliach-account' },
    }))
  return client
}

export async function currentSession(): Promise<Session | null> {
  return (await (await cloud()).auth.getSession()).data.session
}

export async function onSession(cb: (s: Session | null) => void) {
  const { data } = (await cloud()).auth.onAuthStateChange((_event, s) => cb(s))
  return () => data.subscription.unsubscribe()
}

// where Google / the email link returns to: this app, wherever it is served from
const here = () => location.origin + location.pathname

export async function sendEmailCode(email: string) {
  const { error } = await (await cloud()).auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: here() } })
  if (error) throw error
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await (await cloud()).auth.verifyOtp({ email, token: code.trim(), type: 'email' })
  if (error) throw error
}

export async function signInWithGoogle() {
  // remembered so the app reopens on the account screen after Google returns
  sessionStorage.setItem('shaliach-return', '#/account')
  const { error } = await (await cloud()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } })
  if (error) throw error
}

export async function signOut() {
  await (await cloud()).auth.signOut({ scope: 'local' })
}

export interface CopyReport {
  phone: Record<string, unknown>
  account: Record<string, unknown>
  skipped: Record<string, number>
}

// Each browser or installed app gets a random name of its own, so the account can tell which device a
// copy came from. Kept outside the `shaliach:` keys so it never travels in a backup to another phone.
function deviceId() {
  try {
    let id = localStorage.getItem('shaliach-device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('shaliach-device', id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

function deviceLabel() {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'מחשב Windows'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'מכשיר אחר'
}

export interface CopySource { thisDevice: boolean; label: string; at: string }

// Where the copy in the account came from. A copy replaces the previous one, so the screen warns
// before a second device overwrites what the first one sent.
export async function lastCopySource(): Promise<CopySource | null> {
  const { data, error } = await (await cloud()).from('legacy_imports')
    .select('device:snapshot->>deviceId, label:snapshot->>deviceLabel, created_at')
    .not('converted_at', 'is', null).order('created_at', { ascending: false }).limit(1)
  if (error || !data?.length) return null
  const row = data[0] as { device: string | null; label: string | null; created_at: string }
  return { thisDevice: row.device === deviceId(), label: row.label ?? 'מכשיר אחר', at: row.created_at }
}

// What travels to the account: the same content as the backup file, without caches and tokens.
function snapshotOfThisDevice() {
  const backup = buildBackup()
  const data = { ...backup.data }
  delete data.googleToken
  delete data.googleEvents // a cache of Google's own events; it is fetched again
  delete data.lastAccountCopy // bookkeeping of the copy itself
  return { backup, data }
}

// a short fingerprint of the content, to skip a backup when nothing changed
function fingerprint(data: unknown) {
  const text = JSON.stringify(data)
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${text.length}:${h}`
}

const SYNCED = 'shaliach-synced' // fingerprint of what the account already has from this device
const CLAIM = 'shaliach-claim' // set by a restore: this device takes over as the one that backs up
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignore */ } }

// Sends a copy of what is on this device to the account. Nothing on the device changes; each run brings
// the account in line with the device. Tokens never travel: the backup leaves the GitHub ones out and
// the database drops the Google one.
export async function copyPhoneToAccount(): Promise<CopyReport> {
  const db = await cloud()
  if (!(await currentSession())) throw new Error('not signed in')
  const { backup, data } = snapshotOfThisDevice()
  const snapshot = { ...backup, data, deviceId: deviceId(), deviceLabel: deviceLabel() }
  const { data: report, error } = await db.rpc('sync_phone_snapshot', { p_snapshot: snapshot })
  if (error) throw error
  write(SYNCED, fingerprint(data))
  write('shaliach:lastAccountCopy', new Date().toISOString())
  return report as CopyReport
}

export type BackupState = 'off' | 'other-device' | 'up-to-date' | 'saved' | 'failed'

// Whether a signed-in session is stored on this device, without loading the account library
export const maybeSignedIn = () => cloudAvailable && !!read('shaliach-account')

let running: Promise<BackupState> | null = null
// The automatic backup: called by the app from time to time. It sends a copy only when this device is
// the one the account's copy comes from (or there is no copy yet) and something has changed.
export function backupIfNeeded(): Promise<BackupState> {
  running ??= (async (): Promise<BackupState> => {
    try {
      if (!maybeSignedIn() || !navigator.onLine) return 'off'
      const { data } = snapshotOfThisDevice()
      const claim = read(CLAIM) === '1'
      if (!claim && read(SYNCED) === fingerprint(data)) return 'up-to-date'
      if (!(await currentSession())) return 'off'
      if (!claim) {
        const source = await lastCopySource()
        if (source && !source.thisDevice) return 'other-device'
      }
      await copyPhoneToAccount()
      write(CLAIM, null)
      return 'saved'
    } catch {
      return 'failed'
    } finally {
      running = null
    }
  })()
  return running
}

// Brings the account's latest copy onto this device, replacing what is here, and makes this device the
// one that backs up from now on. Used on a new or reset phone.
export async function restoreFromAccount(restore: (b: { app: 'shaliach'; version: 1; createdAt: string; data: Record<string, unknown> }) => void) {
  const { data, error } = await (await cloud()).from('legacy_imports').select('snapshot').order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const snap = data?.[0]?.snapshot as { app?: string; version?: number; createdAt?: string; data?: Record<string, unknown> } | undefined
  if (!snap || snap.app !== 'shaliach' || !snap.data) throw new Error('no copy in the account')
  write(CLAIM, '1')
  write(SYNCED, null)
  restore({ app: 'shaliach', version: 1, createdAt: snap.createdAt ?? new Date().toISOString(), data: snap.data })
}

export const lastAccountCopy = () => {
  try {
    return localStorage.getItem('shaliach:lastAccountCopy')
  } catch {
    return null
  }
}
