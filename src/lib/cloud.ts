// The account in the cloud (Supabase). It exists only in builds that are given the project address and
// its public key; in every other build this file does nothing and the app works from the phone alone.
// The key here is the publishable one: it identifies the project and grants nothing by itself. What a
// signed-in person may read or change is decided by the database rules, per user.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { buildBackup } from './backup'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const cloudAvailable = Boolean(URL_ && KEY)

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

// Sends a copy of what is on the phone to the account. Nothing on the phone changes, and until the
// account is made the main copy this can be repeated: each run brings the account in line with the phone.
// Tokens never travel: the backup leaves the GitHub ones out and the database drops the Google one.
export async function copyPhoneToAccount(): Promise<CopyReport> {
  const db = await cloud()
  const session = await currentSession()
  if (!session) throw new Error('not signed in')
  const backup = buildBackup()
  const data = { ...backup.data }
  delete data.googleToken
  delete data.googleEvents // a cache of Google's own events; it is fetched again
  const { data: row, error } = await db.from('legacy_imports').insert({ user_id: session.user.id, snapshot: { ...backup, data } }).select('id').single()
  if (error) throw error
  const { data: report, error: failed } = await db.rpc('import_legacy_snapshot', { p_import_id: row.id, p_mirror: true })
  if (failed) throw failed
  try {
    localStorage.setItem('shaliach:lastAccountCopy', new Date().toISOString())
  } catch { /* the copy itself succeeded */ }
  return report as CopyReport
}

export const lastAccountCopy = () => {
  try {
    return localStorage.getItem('shaliach:lastAccountCopy')
  } catch {
    return null
  }
}
