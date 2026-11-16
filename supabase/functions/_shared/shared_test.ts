// Run with: DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/_shared/
import nodeAssert from 'node:assert/strict'
const assert = (v: unknown) => nodeAssert.ok(v)
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b)
const assertRejects = (f: () => Promise<unknown>) => nodeAssert.rejects(f)
import { decryptToken, encryptToken, sameSecret } from './crypto.ts'
import { authUrl, eventBody, googleEventId, pkceChallenge, SCOPES } from './google.ts'

const KEY = 'k'.repeat(44)

Deno.test('a token survives encrypt then decrypt, and is not stored in the clear', async () => {
  const stored = await encryptToken('1//refresh-token-value', KEY)
  assert(stored.startsWith('v1:'))
  assert(!stored.includes('refresh-token-value'))
  assertEquals(await decryptToken(stored, KEY), '1//refresh-token-value')
})

Deno.test('the same token encrypts differently each time', async () => {
  assert((await encryptToken('same', KEY)) !== (await encryptToken('same', KEY)))
})

Deno.test('a wrong key or a changed value cannot be decrypted', async () => {
  const stored = await encryptToken('secret', KEY)
  await assertRejects(() => decryptToken(stored, 'x'.repeat(44)))
  const [v, iv, data] = stored.split(':')
  const flipped = data.slice(0, -2) + (data.at(-2) === 'A' ? 'B' : 'A') + data.at(-1)
  await assertRejects(() => decryptToken(`${v}:${iv}:${flipped}`, KEY))
})

Deno.test('a short encryption key is refused', async () => {
  await assertRejects(() => encryptToken('x', 'short'))
})

Deno.test('secret comparison', () => {
  assert(sameSecret('abc', 'abc'))
  assert(!sameSecret('abc', 'abd'))
  assert(!sameSecret('abc', 'abcd'))
})

Deno.test('the consent address asks for a lasting, minimal permission', async () => {
  const url = new URL(authUrl({ clientId: 'cid', redirectUri: 'https://x.supabase.co/functions/v1/google-connect-callback', state: 'st', challenge: await pkceChallenge('verifier') }))
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')
  assertEquals(url.searchParams.get('code_challenge_method'), 'S256')
  assertEquals(url.searchParams.get('state'), 'st')
  assertEquals(url.searchParams.get('scope'), SCOPES.join(' '))
  assert(!url.searchParams.get('scope')!.includes('auth/calendar '))
  assert(!url.searchParams.get('scope')!.endsWith('auth/calendar'))
})

Deno.test('an event always gets the same Google id', () => {
  assertEquals(googleEventId('5EED0000-0000-4000-8000-000000000050'), '5eed0000000040008000000000000050')
  assert(/^[0-9a-v]{5,1024}$/.test(googleEventId(crypto.randomUUID())))
})

const ev = (o: Partial<Parameters<typeof eventBody>[0]>) => ({ id: 'e', title: 'כותרת', date: '2026-11-20', end_date: null, start_time: null, end_time: null, ...o })

Deno.test('an all-day event ends the day after', () => {
  const b = eventBody(ev({}), 'America/New_York')
  assertEquals(b.start, { date: '2026-11-20' })
  assertEquals(b.end, { date: '2026-11-21' })
  assertEquals(b.summary, 'כותרת')
  assertEquals(b.extendedProperties.private.shaliahEventId, 'e')
})

Deno.test('a vacation covers its last day', () => {
  const b = eventBody(ev({ end_date: '2026-11-27' }), 'America/New_York')
  assertEquals(b.end, { date: '2026-11-28' })
})

Deno.test('a timed event keeps local times and the time zone', () => {
  const b = eventBody(ev({ start_time: '16:30:00', end_time: '18:00:00' }), 'America/New_York')
  assertEquals(b.start, { dateTime: '2026-11-20T16:30:00', timeZone: 'America/New_York' })
  assertEquals(b.end, { dateTime: '2026-11-20T18:00:00', timeZone: 'America/New_York' })
})

Deno.test('no end time means one hour, also across midnight', () => {
  assertEquals(eventBody(ev({ start_time: '09:00' }), 'UTC').end, { dateTime: '2026-11-20T10:00:00', timeZone: 'UTC' })
  assertEquals(eventBody(ev({ start_time: '23:30' }), 'UTC').end, { dateTime: '2026-11-21T00:30:00', timeZone: 'UTC' })
})

Deno.test('an end before the start means it ends the next day', () => {
  assertEquals(eventBody(ev({ start_time: '22:00', end_time: '01:00' }), 'UTC').end, { dateTime: '2026-11-21T01:00:00', timeZone: 'UTC' })
})
