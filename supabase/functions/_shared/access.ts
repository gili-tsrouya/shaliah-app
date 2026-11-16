// A fresh Google access token for a user, from their stored (encrypted) refresh token.
// When Google refuses the refresh token, the connection is marked so the app can ask to reconnect once.
import { decryptToken } from './crypto.ts'
import { GoogleAuthError, refreshAccess } from './google.ts'
import { googleConfig, serverDb } from './server.ts'

export type AccessResult = { ok: true; token: string; expiresIn: number } | { ok: false; reason: 'not_connected' | 'needs_reconnect' | 'temporary'; detail?: string }

export async function accessTokenFor(userId: string): Promise<AccessResult> {
  const db = serverDb()
  const cfg = googleConfig()
  const { data: conn } = await db.from('google_connections').select('refresh_token_ciphertext, status').eq('user_id', userId).maybeSingle()
  if (!conn) return { ok: false, reason: 'not_connected' }
  if (conn.status !== 'connected') return { ok: false, reason: 'needs_reconnect' }
  try {
    const refreshToken = await decryptToken(conn.refresh_token_ciphertext, cfg.encryptionKey)
    const t = await refreshAccess({ refreshToken, clientId: cfg.clientId, clientSecret: cfg.clientSecret })
    return { ok: true, token: t.access_token, expiresIn: t.expires_in ?? 3600 }
  } catch (e) {
    if (e instanceof GoogleAuthError && (e.code === 'invalid_grant' || e.code === 'unauthorized_client')) {
      await db.from('google_connections').update({ status: 'needs_reconnect', last_error: e.code }).eq('user_id', userId)
      return { ok: false, reason: 'needs_reconnect', detail: e.code }
    }
    return { ok: false, reason: 'temporary', detail: e instanceof Error ? e.message : 'unknown' }
  }
}
