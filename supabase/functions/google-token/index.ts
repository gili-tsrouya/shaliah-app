// A short-lived Google access token for the signed-in owner, made from the lasting permission that
// only the server holds. The app uses it for its own calendar sync, so it no longer has to ask Google
// again every hour. The lasting permission itself never leaves the server.
import { accessTokenFor } from '../_shared/access.ts'
import { callingUser, cors, json } from '../_shared/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const userId = await callingUser(req)
  if (!userId) return json({ error: 'not_signed_in' }, 401)
  const access = await accessTokenFor(userId)
  if (!access.ok) return json({ error: access.reason }, access.reason === 'temporary' ? 503 : 409)
  return json({ access_token: access.token, expires_in: access.expiresIn })
})
