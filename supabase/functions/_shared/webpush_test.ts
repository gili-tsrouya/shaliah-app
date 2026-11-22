import assert from 'node:assert/strict'
import { newVapidKeys, sendWakeUp, vapidHeader } from './webpush.ts'

const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))

Deno.test('the VAPID token is signed with the key and names the push service', async () => {
  const keys = await newVapidKeys()
  assert.equal(unb64url(keys.publicKey).length, 65)
  const header = await vapidHeader('https://web.push.apple.com/abc', keys, 'https://example.test/')
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
  assert.equal(k, keys.publicKey)
  const [h, c, s] = token.split('.')
  const claims = JSON.parse(new TextDecoder().decode(unb64url(c)))
  assert.equal(claims.aud, 'https://web.push.apple.com')
  const pub = await crypto.subtle.importKey('raw', unb64url(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64url(s), new TextEncoder().encode(`${h}.${c}`)))
})

Deno.test('a subscription the phone dropped is reported as gone', async () => {
  const keys = await newVapidKeys()
  const fake = (status: number) => (() => Promise.resolve(new Response(null, { status }))) as typeof fetch
  assert.deepEqual(await sendWakeUp({ endpoint: 'https://push.test/1' }, keys, 'https://x.test/', fake(201)), { ok: true, status: 201, gone: false })
  assert.deepEqual(await sendWakeUp({ endpoint: 'https://push.test/1' }, keys, 'https://x.test/', fake(410)), { ok: false, status: 410, gone: true })
})
