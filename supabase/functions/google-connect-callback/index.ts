// Step 2: Google sends the user back here. The code is exchanged on the server, the refresh token is
// encrypted and stored where no app user can read it, and the browser is told only "connected".
import { encryptToken, KEY_VERSION } from '../_shared/crypto.ts'
import { exchangeCode, SCOPES } from '../_shared/google.ts'
import { googleConfig, serverDb } from '../_shared/server.ts'

function done(outcome: 'connected' | 'cancelled' | 'failed', detail = '') {
  const { returnUrl } = googleConfig()
  if (returnUrl) {
    const to = new URL(returnUrl)
    to.searchParams.set('google', outcome)
    return Response.redirect(to.toString(), 302)
  }
  const text = {
    connected: 'Google Calendar is connected. You can close this window and go back to the app.',
    cancelled: 'Nothing was connected. You can close this window.',
    failed: `Connecting did not work${detail ? ` (${detail})` : ''}. Close this window and try again from the app.`,
  }[outcome]
  return new Response(text, { status: outcome === 'failed' ? 400 : 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams
  const state = q.get('state') ?? ''
  const db = serverDb()

  // the state works once: it is removed as it is read
  const { data: row } = await db.from('google_oauth_states').delete().eq('state', state).select().maybeSingle()
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return done('failed', 'this link has expired or was already used')
  if (q.get('error')) return done('cancelled')
  const code = q.get('code')
  if (!code) return done('failed', 'no code')

  const cfg = googleConfig()
  try {
    const t = await exchangeCode({ code, verifier: row.code_verifier, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri })
    const granted = (t.scope ?? '').split(' ').filter(Boolean)
    if (!t.refresh_token) return done('failed', 'Google did not return a lasting permission')
    const missing = SCOPES.filter((s) => !granted.includes(s))
    const { error } = await db.from('google_connections').upsert({
      user_id: row.user_id,
      refresh_token_ciphertext: await encryptToken(t.refresh_token, cfg.encryptionKey),
      key_version: KEY_VERSION,
      scopes: granted,
      status: missing.length ? 'missing_permission' : 'connected',
      last_error: missing.length ? 'some permissions were not granted' : null,
      connected_at: new Date().toISOString(),
    })
    if (error) return done('failed', 'could not save the connection')
    if (missing.length) return done('failed', 'not every permission was ticked; please connect again and allow all of them')
    await db.rpc('enqueue_upcoming_events', { p_user: row.user_id })
    return done('connected')
  } catch (_e) {
    return done('failed', 'Google refused the request')
  }
})
