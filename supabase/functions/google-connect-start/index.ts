// Step 1 of connecting Google Calendar: returns the Google consent address for the signed-in user.
// The one-time `state` ties Google's answer to this user; the app never sees any Google secret.
import { randomToken } from '../_shared/crypto.ts'
import { authUrl, pkceChallenge } from '../_shared/google.ts'
import { callingUser, cors, googleConfig, isServerCall, json, serverDb } from '../_shared/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let userId = await callingUser(req)
  let minutes = 10
  if (!userId && isServerCall(req)) {
    // server-side use (tests, support): the caller names the user and gets a longer-lived link
    const body = await req.json().catch(() => ({}))
    userId = typeof body.user_id === 'string' ? body.user_id : null
    minutes = 60 * 48
  }
  if (!userId) return json({ error: 'not_signed_in' }, 401)

  const cfg = googleConfig()
  if (!cfg.clientId || !cfg.clientSecret || !cfg.encryptionKey) return json({ error: 'not_configured' }, 500)

  const state = randomToken()
  const verifier = randomToken(48)
  const db = serverDb()
  await db.from('google_oauth_states').delete().lt('expires_at', new Date().toISOString())
  const { error } = await db.from('google_oauth_states').insert({
    state, user_id: userId, code_verifier: verifier, expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
  })
  if (error) return json({ error: 'could_not_start' }, 500)

  return json({ url: authUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, challenge: await pkceChallenge(verifier) }) })
})
