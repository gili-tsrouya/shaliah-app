// Sends waiting calendar changes to Google. Called every minute by the database when something is
// waiting, with a server key. Our database is the source of truth: Google is brought in line with it.
// A failure never loses anything: the line stays in the outbox and is tried again later.
import { accessTokenFor, type AccessResult } from '../_shared/access.ts'
import { calendarFetch, eventBody, googleEventId, type OurEvent } from '../_shared/google.ts'
import { isServerCall, json, serverDb } from '../_shared/server.ts'

interface OutboxRow {
  id: number
  user_id: string
  event_id: string | null
  op: 'upsert' | 'delete'
  attempts: number
  external_calendar_id: string | null
  external_event_id: string | null
}

const enc = encodeURIComponent
const gone = (status: number) => status === 404 || status === 410

class Retry extends Error {}

async function removeFromGoogle(token: string, calendarId: string, eventId: string) {
  const res = await calendarFetch(token, `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' })
  if (!res.ok && !gone(res.status)) throw new Retry(`delete ${res.status}`)
}

// create-or-update with a fixed id: a second attempt finds the first one's event instead of adding another
async function putToGoogle(token: string, calendarId: string, eventId: string, body: unknown, known: boolean) {
  const base = `/calendars/${enc(calendarId)}/events`
  if (!known) {
    const made = await calendarFetch(token, base, { method: 'POST', body: JSON.stringify({ ...(body as object), id: eventId }) })
    if (made.ok) return await made.json()
    if (made.status !== 409) throw new Retry(`create ${made.status}`)
  }
  const updated = await calendarFetch(token, `${base}/${enc(eventId)}`, { method: 'PUT', body: JSON.stringify(body) })
  if (updated.ok) return await updated.json()
  if (known && gone(updated.status)) return await putToGoogle(token, calendarId, eventId, body, false)
  throw new Retry(`update ${updated.status}`)
}

async function handle(row: OutboxRow, token: string) {
  const db = serverDb()
  if (row.op === 'delete') {
    if (row.external_calendar_id && row.external_event_id) await removeFromGoogle(token, row.external_calendar_id, row.external_event_id)
    return 'deleted'
  }
  const { data: ev } = await db.from('events')
    .select('id, title, date, end_date, start_time, end_time, deleted_at, category:calendar_categories(google_calendar_id)')
    .eq('id', row.event_id).maybeSingle()
  const { data: link } = await db.from('event_external_links').select('*').eq('event_id', row.event_id).eq('provider', 'google').maybeSingle()
  // deno-lint-ignore no-explicit-any
  const target: string | null = ev && !ev.deleted_at ? ((ev.category as any)?.google_calendar_id ?? null) : null

  if (link && link.external_calendar_id !== target) {
    // deleted here, or moved to another calendar (or to none): take the old copy away
    await removeFromGoogle(token, link.external_calendar_id, link.external_event_id)
    await db.from('event_external_links').delete().eq('id', link.id)
    if (!target) return 'removed'
  }
  if (!ev || !target) return 'nothing to send'

  const { data: profile } = await db.from('profiles').select('timezone').eq('user_id', row.user_id).maybeSingle()
  const known = link?.external_calendar_id === target
  const eventId = known ? link!.external_event_id : googleEventId(ev.id)
  const saved = await putToGoogle(token, target, eventId, eventBody(ev as OurEvent, profile?.timezone ?? 'America/New_York'), known)
  const fields = { etag: saved.etag ?? null, sync_state: 'synced', last_synced_at: new Date().toISOString(), last_error: null }
  if (known) await db.from('event_external_links').update(fields).eq('id', link!.id)
  else {
    await db.from('event_external_links').upsert(
      { user_id: row.user_id, event_id: ev.id, provider: 'google', external_calendar_id: target, external_event_id: saved.id ?? eventId, ...fields },
      { onConflict: 'user_id,provider,external_calendar_id,external_event_id' })
  }
  return known ? 'updated' : 'created'
}

Deno.serve(async (req) => {
  if (!isServerCall(req)) return json({ error: 'server_only' }, 401)
  const db = serverDb()
  const input = await req.json().catch(() => ({}))

  // test aid: how many Google events carry this event's mark (must never be more than one)
  if (input.verify) {
    const access = await accessTokenFor(input.verify.user_id)
    if (!access.ok) return json({ error: access.reason }, 409)
    const res = await calendarFetch(access.token,
      `/calendars/${enc(input.verify.calendar_id)}/events?privateExtendedProperty=${enc(`shaliahEventId=${input.verify.event_id}`)}&showDeleted=false&singleEvents=true`)
    const body = await res.json()
    return json({ count: (body.items ?? []).length, titles: (body.items ?? []).map((i: { summary: string }) => i.summary) })
  }

  const started = new Date().toISOString()
  const { data: rows, error } = await db.rpc('claim_sync_outbox', { p_limit: 20 })
  if (error) return json({ error: 'claim_failed' }, 500)

  const tokens = new Map<string, AccessResult>()
  const results: Record<string, number> = {}
  const count = (k: string) => (results[k] = (results[k] ?? 0) + 1)

  for (const row of (rows ?? []) as OutboxRow[]) {
    if (!tokens.has(row.user_id)) tokens.set(row.user_id, await accessTokenFor(row.user_id))
    const access = tokens.get(row.user_id)!
    if (!access.ok) {
      // no token right now: keep the line. A reconnect (or the next run) picks it up again.
      await db.from('sync_outbox').update({ next_attempt_at: new Date(Date.now() + 60_000).toISOString(), last_error: access.reason }).eq('id', row.id)
      count(access.reason)
      continue
    }
    try {
      const what = await handle(row, access.token)
      await db.from('sync_outbox').update({ done_at: new Date().toISOString(), last_error: null }).eq('id', row.id)
      count(what)
    } catch (e) {
      // Google said no for now: wait longer each time (2, 4, 8 … minutes, at most 6 hours)
      const attempts = row.attempts + 1
      const waitMinutes = Math.min(2 ** attempts, 360)
      const message = e instanceof Error ? e.message : 'unknown'
      await db.from('sync_outbox').update({ attempts, next_attempt_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(), last_error: message }).eq('id', row.id)
      if (row.event_id) await db.from('event_external_links').update({ sync_state: 'error', last_error: message }).eq('event_id', row.event_id)
      count('retry later')
    }
  }

  const users = [...tokens.entries()].filter(([, a]) => a.ok).map(([u]) => u)
  if (users.length) await db.from('google_connections').update({ last_sync_at: new Date().toISOString(), last_error: null }).in('user_id', users)
  if ((rows ?? []).length) {
    await db.from('job_runs').insert({ job: 'google-sync', started_at: started, finished_at: new Date().toISOString(), ok: !results['retry later'], stats: results })
  }
  return json({ processed: (rows ?? []).length, results })
})
