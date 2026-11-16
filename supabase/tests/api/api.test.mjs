// API-level access tests against a throwaway local backend: two synthetic users sign in for real and
// try to reach each other's rows and photo files through the same API the app will use.
// Everything created here is removed at the end. It refuses to run against a hosted project.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_URL
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY
const secret = process.env.SUPABASE_SECRET_KEY
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('refusing to run: only a local throwaway backend is allowed')

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, secret, opts)

let passed = 0
const ok = (label) => { passed++; console.log(`ok ${passed} - ${label}`) }
const fail = (label, detail) => { throw new Error(`FAILED: ${label}${detail ? ` (${detail})` : ''}`) }
// the call must be refused or come back empty: either way nothing of the other user's is given out
const denied = (label, { data, error }) => {
  const empty = data === null || data === undefined || (Array.isArray(data) && data.length === 0)
  if (!error && !empty) fail(label, `got ${JSON.stringify(data).slice(0, 120)}`)
  ok(label)
}
const works = (label, { data, error }) => {
  if (error) fail(label, error.message)
  ok(label)
  return data
}

async function signedInUser(email) {
  const password = randomBytes(24).toString('base64url')
  const list = await admin.auth.admin.listUsers({ perPage: 200 })
  if (list.error) throw new Error(`list users: ${list.error.message}`)
  const found = list.data.users.find((u) => u.email === email)
  const res = found
    ? await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (res.error) throw new Error(`prepare ${email}: ${res.error.message}`)
  const client = createClient(url, publishable, opts)
  const session = await client.auth.signInWithPassword({ email, password })
  if (session.error) throw new Error(`sign in ${email}: ${session.error.message}`)
  return { client, id: session.data.user.id }
}

const jpeg = (marker) => Buffer.concat([
  Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64'),
  Buffer.from(`api-test:${marker}`),
])

const a = await signedInUser('api-test-a@example.test')
const b = await signedInUser('api-test-b@example.test')
const anon = createClient(url, publishable, opts)
ok('two synthetic users signed in through the real sign-in service')

const memoryId = randomUUID()
const photoId = randomUUID()
const importId = randomUUID()
const path = `${a.id}/${memoryId}/${photoId}/display.jpg`
const media = (c) => c.storage.from('media')

try {
  // ---- user A sets up their own data through the API ----
  works('A can save their profile', await a.client.from('profiles').upsert({ user_id: a.id, display_name: 'API test A' }))
  works('A can add a memory', await a.client.from('memories').insert({ id: memoryId, user_id: a.id, date: '2026-11-16', kind: 'shlichut', body: 'private note' }))
  works('A can add a photo record', await a.client.from('photos').insert({ id: photoId, user_id: a.id, memory_id: memoryId }))
  works('A can upload a photo file to their own folder', await media(a.client).upload(path, jpeg('a'), { contentType: 'image/jpeg' }))
  // the journal screen's own queries
  await a.client.from('photos').update({ upload_state: 'uploaded', width: 1, height: 1 }).eq('id', photoId)
  const timeline = works('the journal list loads memories with their photos in one call', await a.client.from('memories')
    .select('id, date, body, mood, kind, tags, photos(id, width, height, may_show_minors, deleted_at, upload_state)')
    .is('deleted_at', null).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60))
  if (!timeline.find((m) => m.id === memoryId)?.photos?.some((p) => p.id === photoId)) fail('the journal list includes the photo of the memory')
  ok('the journal list includes the photo of the memory')
  const links = works('the journal gets short-lived links for its photos', await media(a.client).createSignedUrls([path], 3600))
  if (!links[0]?.signedUrl) fail('a short-lived link is returned for the photo')
  ok('a short-lived link is returned for the photo')
  denied('B gets no link for A\'s photo', { data: (await media(b.client).createSignedUrls([path], 3600)).data?.filter((l) => l.signedUrl) ?? [], error: null })
  const flag = works('A can read their photo record', await a.client.from('photos').select('may_show_minors').eq('id', photoId).single())
  if (flag.may_show_minors !== true) fail('a photo in a shlichut memory is flagged through the API too')
  ok('a photo in a shlichut memory is flagged through the API too')

  // ---- user B tries to reach A's rows ----
  denied('B cannot read A\'s memories', await b.client.from('memories').select('*').eq('user_id', a.id))
  denied('B cannot read A\'s memory by its id', await b.client.from('memories').select('*').eq('id', memoryId))
  denied('B cannot read A\'s photo records', await b.client.from('photos').select('*').eq('id', photoId))
  denied('B cannot read A\'s profile', await b.client.from('profiles').select('*').eq('user_id', a.id))
  denied('B cannot change A\'s memory', await b.client.from('memories').update({ body: 'changed by B' }).eq('id', memoryId).select())
  denied('B cannot delete A\'s memory', await b.client.from('memories').delete().eq('id', memoryId).select())
  denied('B cannot add a memory in A\'s name', await b.client.from('memories').insert({ user_id: a.id, date: '2026-11-16' }).select())
  denied('B cannot attach a photo to A\'s memory', await b.client.from('photos').insert({ user_id: b.id, memory_id: memoryId }).select())
  denied('B cannot read Google tokens', await b.client.from('google_connections').select('*'))
  denied('B cannot read the sync queue', await b.client.from('sync_outbox').select('*'))
  const still = works('A still has the memory, unchanged', await a.client.from('memories').select('body').eq('id', memoryId).single())
  if (still.body !== 'private note') fail('A\'s memory was changed')

  // ---- user B tries to reach A's photo file ----
  denied('B cannot download A\'s photo by its exact path', await media(b.client).download(path))
  denied('B cannot list A\'s folder', await media(b.client).list(a.id))
  denied('B cannot list A\'s memory folder', await media(b.client).list(`${a.id}/${memoryId}/${photoId}`))
  denied('B cannot get a signed link to A\'s photo', await media(b.client).createSignedUrl(path, 60))
  denied('B cannot overwrite A\'s photo', await media(b.client).upload(path, jpeg('b-overwrite'), { contentType: 'image/jpeg', upsert: true }))
  denied('B cannot put a new file in A\'s folder', await media(b.client).upload(`${a.id}/${memoryId}/planted.jpg`, jpeg('planted'), { contentType: 'image/jpeg' }))
  denied('B cannot move A\'s photo into their own folder', await media(b.client).move(path, `${b.id}/stolen.jpg`))
  denied('B cannot copy A\'s photo into their own folder', await media(b.client).copy(path, `${b.id}/copied.jpg`))
  denied('B cannot delete A\'s photo', await media(b.client).remove([path]))
  const mine = works('A can still download their photo after B\'s attempts', await media(a.client).download(path))
  if (!Buffer.from(await mine.arrayBuffer()).equals(jpeg('a'))) fail('A\'s photo file was changed')
  ok('A\'s photo file is byte-for-byte unchanged')
  // A has just downloaded the file, so any cache in front of storage is warm: B must still be refused
  denied('B is still refused right after A viewed the photo (no cache leak)', await media(b.client).download(path))
  denied('a visitor is still refused right after A viewed the photo', await media(createClient(url, publishable, opts)).download(path))

  // ---- nobody signed in ----
  denied('a visitor who is not signed in cannot read memories', await anon.from('memories').select('*'))
  denied('a visitor cannot read profiles', await anon.from('profiles').select('*'))
  denied('a visitor cannot download the photo', await media(anon).download(path))
  denied('a visitor cannot get a signed link', await media(anon).createSignedUrl(path, 60))
  const pub = await fetch(`${url}/storage/v1/object/public/media/${path}`)
  if (pub.ok) fail('the photo is reachable by a public link')
  ok(`there is no public link to the photo (HTTP ${pub.status})`)

  // ---- signed links: work for the owner, then expire ----
  const link = works('A can make a short-lived link to their own photo', await media(a.client).createSignedUrl(path, 4))
  const fresh = await fetch(link.signedUrl)
  if (!fresh.ok) fail('the fresh signed link works', `HTTP ${fresh.status}`)
  ok('the fresh signed link works')
  await new Promise((r) => setTimeout(r, 7000))
  const stale = await fetch(link.signedUrl)
  if (stale.ok) fail('the signed link stops working after it expires')
  ok(`the signed link stops working after it expires (HTTP ${stale.status})`)

  // ---- wrong file types and the import function through the API ----
  denied('a file that is not an image is refused', await media(a.client).upload(`${a.id}/${memoryId}/notes.html`, Buffer.from('<html></html>'), { contentType: 'text/html' }))
  works('A can store a snapshot of old phone data', await a.client.from('legacy_imports').insert({
    id: importId, user_id: a.id,
    snapshot: { app: 'shaliach', version: 1, data: { settings: { name: 'API test A', githubToken: 'SHOULD-BE-STRIPPED' }, tasks: [{ id: 'api-t1', title: 'מבחן', work: 'personal', status: 'todo' }] } },
  }))
  denied('B cannot import A\'s snapshot', await b.client.rpc('import_legacy_snapshot', { p_import_id: importId }))
  denied('a visitor cannot call the import', await anon.rpc('import_legacy_snapshot', { p_import_id: importId }))
  const report = works('A can import their own snapshot', await a.client.rpc('import_legacy_snapshot', { p_import_id: importId }))
  if (report.account.tasks !== 1 || report.phone.tasks !== 1) fail('the import report counts one task on each side', JSON.stringify(report.account))
  ok('the import report counts one task on each side')
  const snap = works('A can read the stored snapshot back', await a.client.from('legacy_imports').select('snapshot').eq('id', importId).single())
  if (JSON.stringify(snap.snapshot).includes('SHOULD-BE-STRIPPED')) fail('a token survived in the stored snapshot')
  ok('a token sent inside a snapshot is not stored')
  denied('A cannot call the internal import function directly', await a.client.rpc('import_legacy_snapshot_for', { p_import_id: importId, p_user: b.id }))

  // ---- Google connection functions: who may call what (no Google account is involved here) ----
  const fn = (name, { token, key = publishable, body, method = 'POST' } = {}) =>
    fetch(`${url}/functions/v1/${name}`, {
      method,
      headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    })
  const expectStatus = async (label, res, want) => {
    if (res.status !== want) fail(label, `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    ok(label)
    return res
  }
  const tokenA = (await a.client.auth.getSession()).data.session.access_token

  await expectStatus('starting a Google connection needs a signed-in user', await fn('google-connect-start'), 401)
  const start = await (await expectStatus('a signed-in user can start a Google connection', await fn('google-connect-start', { token: tokenA }), 200)).json()
  const consent = new URL(start.url)
  if (consent.hostname !== 'accounts.google.com' || consent.searchParams.get('access_type') !== 'offline'
    || !consent.searchParams.get('redirect_uri').endsWith('/functions/v1/google-connect-callback')
    || consent.searchParams.get('scope').split(' ').some((sc) => sc.endsWith('/auth/calendar'))) fail('the consent address is well formed', start.url.slice(0, 80))
  ok('the consent address goes to Google, asks for a lasting permission and not for full calendar control')
  denied('a user cannot read the connect-flow states', await a.client.from('google_oauth_states').select('*'))
  await expectStatus('a made-up state is refused by the callback', await fn('google-connect-callback?state=made-up&code=x', { method: 'GET' }), 400)
  await expectStatus('the sender refuses a call without a server key', await fn('google-sync'), 401)
  await expectStatus('the sender refuses a signed-in user', await fn('google-sync', { token: tokenA }), 401)
  const run = await (await expectStatus('the sender accepts a server key', await fn('google-sync', { key: secret }), 200)).json()
  if (typeof run.processed !== 'number') fail('the sender reports what it processed')
  await expectStatus('the calendar list needs a signed-in user', await fn('google-calendars'), 401)
  await expectStatus('the calendar list says so when Google is not connected', await fn('google-calendars', { token: tokenA }), 409)
  await expectStatus('a Google access token needs a signed-in user', await fn('google-token'), 401)
  await expectStatus('a server key alone gets no Google access token', await fn('google-token', { key: secret }), 401)
  await expectStatus('no access token when Google is not connected', await fn('google-token', { token: tokenA }), 409)
  await expectStatus('disconnecting needs a signed-in user', await fn('google-disconnect'), 401)
  await expectStatus('disconnecting when nothing is connected is harmless', await fn('google-disconnect', { token: tokenA }), 200)

  // ---- the owner can delete their own file ----
  const removed = works('A can delete their own photo file', await media(a.client).remove([path]))
  if (removed.length !== 1) fail('exactly one file was deleted', `${removed.length}`)
  denied('the deleted file is no longer listed', await media(a.client).list(`${a.id}/${memoryId}/${photoId}`))
  // a just-deleted file can stay downloadable for a short while from Supabase's cache; report it, don't hide it
  const after = await media(a.client).download(path)
  console.log(`note: for the owner, download right after delete ${after.error ? 'is refused' : 'still answers (served from cache)'}`)
  denied('B cannot download the deleted file either', await media(b.client).download(path))
} finally {
  // remove everything this run created (the two test accounts stay, for the next run)
  for (const u of [a, b]) {
    const files = []
    const walk = async (prefix) => {
      const { data } = await media(admin).list(prefix, { limit: 1000 })
      for (const e of data ?? []) {
        if (e.id === null) await walk(`${prefix}/${e.name}`)
        else files.push(`${prefix}/${e.name}`)
      }
    }
    await walk(u.id)
    if (files.length) await media(admin).remove(files)
    await admin.from('google_oauth_states').delete().eq('user_id', u.id)
    for (const t of ['photos', 'memories', 'tasks', 'calendar_categories', 'agent_preferences', 'user_item_state', 'legacy_imports', 'change_log', 'profiles']) {
      await admin.from(t).delete().eq('user_id', u.id)
    }
  }
}

console.log(`ALL ${passed} API TESTS PASSED`)
