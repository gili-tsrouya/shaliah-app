// The morning "who to call" wake-up push.
//   {action:"key"}       anyone: the public half of the signing key, which the app subscribes with
//   {action:"test"}      the signed-in user: send a wake-up to their phone right now
//   {action:"send-due"}  the database (server key), every five minutes when a reminder is due
// The signing key is made here the first time and kept encrypted in server_keys.
import { decryptToken, encryptToken } from '../_shared/crypto.ts'
import { newVapidKeys, sendWakeUp, type VapidKeys } from '../_shared/webpush.ts'
import { callingUser, cors, googleConfig, isServerCall, json, serverDb } from '../_shared/server.ts'

const SUBJECT = 'https://gili-tsrouya.github.io/shaliah-app/'
let cachedKeys: VapidKeys | null = null

async function vapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys
  const secret = googleConfig().encryptionKey
  const db = serverDb()
  const read = async () => (await db.from('server_keys').select('value').eq('name', 'vapid').maybeSingle()).data?.value as string | undefined
  let stored = await read()
  if (!stored) {
    const made = await newVapidKeys()
    await db.from('server_keys').upsert({ name: 'vapid', value: await encryptToken(JSON.stringify(made), secret) }, { onConflict: 'name', ignoreDuplicates: true })
    stored = await read()
    if (!stored) throw new Error('could not keep the push key')
  }
  cachedKeys = JSON.parse(await decryptToken(stored, secret)) as VapidKeys
  return cachedKeys
}

interface Reminder { user_id: string; subscription: { endpoint: string } }

async function sendTo(r: Reminder) {
  try {
    const res = await sendWakeUp(r.subscription, await vapidKeys(), SUBJECT)
    return res
  } catch (e) {
    console.error('push failed', (e as Error).message)
    return { ok: false, status: 0, gone: false }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const { action } = await req.json().catch(() => ({})) as { action?: string }

  if (action === 'key') return json({ publicKey: (await vapidKeys()).publicKey })

  if (action === 'send-due') {
    if (!isServerCall(req)) return json({ error: 'server only' }, 401)
    const db = serverDb()
    const { data, error } = await db.rpc('claim_push_reminders')
    if (error) return json({ error: error.message }, 500)
    let sent = 0
    for (const r of (data ?? []) as Reminder[]) {
      const res = await sendTo(r)
      if (res.ok) sent++
      await db.rpc('finish_push_reminder', {
        p_user: r.user_id, p_ok: res.ok,
        p_error: res.ok ? null : res.gone ? 'gone' : `status ${res.status}`,
        p_retry: !res.ok && !res.gone,
      })
    }
    return json({ due: data?.length ?? 0, sent })
  }

  if (action === 'test') {
    const user = await callingUser(req)
    if (!user) return json({ error: 'sign in' }, 401)
    const { data } = await serverDb().from('push_reminders').select('user_id, subscription').eq('user_id', user).maybeSingle()
    if (!data) return json({ error: 'no reminder' }, 404)
    const res = await sendTo(data as Reminder)
    return json({ sent: res.ok, gone: res.gone, status: res.status })
  }

  return json({ error: 'unknown action' }, 400)
})
