// Disconnect: the permission is withdrawn at Google and the stored token is deleted.
// Links to Google events are kept, so connecting again later does not create duplicates.
import { decryptToken } from '../_shared/crypto.ts'
import { revoke } from '../_shared/google.ts'
import { callingUser, cors, googleConfig, isServerCall, json, serverDb } from '../_shared/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let userId = await callingUser(req)
  if (!userId && isServerCall(req)) userId = (await req.json().catch(() => ({}))).user_id ?? null
  if (!userId) return json({ error: 'not_signed_in' }, 401)

  const db = serverDb()
  const { data: conn } = await db.from('google_connections').select('refresh_token_ciphertext').eq('user_id', userId).maybeSingle()
  if (conn) {
    try {
      await revoke(await decryptToken(conn.refresh_token_ciphertext, googleConfig().encryptionKey))
    } catch { /* the token is deleted below either way */ }
    await db.from('google_connections').delete().eq('user_id', userId)
  }
  return json({ disconnected: true })
})
