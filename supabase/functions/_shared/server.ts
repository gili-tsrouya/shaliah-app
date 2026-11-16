// Shared by every function: who is calling, a server-side database client, and small response helpers.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4'
import { sameSecret } from './crypto.ts'

const env = (name: string) => Deno.env.get(name) ?? ''

export const SUPABASE_URL = () => env('SUPABASE_URL')

function secretKeys(): string[] {
  const keys: string[] = []
  try {
    keys.push(...Object.values(JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}') as Record<string, string>))
  } catch { /* not set */ }
  if (env('SUPABASE_SERVICE_ROLE_KEY')) keys.push(env('SUPABASE_SERVICE_ROLE_KEY'))
  return keys.filter(Boolean)
}

let cached: SupabaseClient | null = null
export function serverDb() {
  const key = secretKeys()[0]
  if (!key) throw new Error('no server key in the function environment')
  cached ??= createClient(SUPABASE_URL(), key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cached
}

// a server-to-server call presents one of the project's secret keys
export function isServerCall(req: Request) {
  const presented = req.headers.get('apikey') ?? ''
  return presented.startsWith('sb_secret_') || presented.split('.').length === 3
    ? secretKeys().some((k) => sameSecret(k, presented))
    : false
}

// a call from the app presents the signed-in user's token
export async function callingUser(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token || token.startsWith('sb_')) return null
  const { data, error } = await serverDb().auth.getUser(token)
  return error ? null : data.user?.id ?? null
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-device-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const googleConfig = () => ({
  clientId: env('GOOGLE_CALENDAR_CLIENT_ID'),
  clientSecret: env('GOOGLE_CALENDAR_CLIENT_SECRET'),
  encryptionKey: env('TOKEN_ENCRYPTION_KEY'),
  redirectUri: `${SUPABASE_URL()}/functions/v1/google-connect-callback`,
  returnUrl: env('APP_RETURN_URL'),
})
