// The user's Google calendars (names and ids only), so a category can be linked to one of them.
import { accessTokenFor } from '../_shared/access.ts'
import { calendarFetch } from '../_shared/google.ts'
import { callingUser, cors, isServerCall, json } from '../_shared/server.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  let userId = await callingUser(req)
  if (!userId && isServerCall(req)) userId = (await req.json().catch(() => ({}))).user_id ?? null
  if (!userId) return json({ error: 'not_signed_in' }, 401)

  const access = await accessTokenFor(userId)
  if (!access.ok) return json({ error: access.reason }, access.reason === 'temporary' ? 503 : 409)
  const res = await calendarFetch(access.token, '/users/me/calendarList?minAccessRole=writer&maxResults=250')
  if (!res.ok) return json({ error: 'google_unavailable', status: res.status }, 503)
  const body = await res.json()
  return json({
    calendars: (body.items ?? []).map((c: { id: string; summary: string; summaryOverride?: string; primary?: boolean }) => ({
      id: c.id, name: c.summaryOverride ?? c.summary, primary: c.primary === true,
    })),
  })
})
