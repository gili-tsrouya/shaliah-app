// Web push without a payload: the phone's service worker builds the message from its own list, so
// nothing needs encrypting. Only the VAPID signature (RFC 8292) is needed: a short ES256 token.
import { b64url } from './crypto.ts'

const enc = new TextEncoder()

export interface VapidKeys { publicKey: string; privateJwk: JsonWebKey }

export async function newVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}

export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`
}

export interface PushResult { ok: boolean; status: number; gone: boolean }

export async function sendWakeUp(subscription: { endpoint: string }, keys: VapidKeys, subject: string, fetcher = fetch): Promise<PushResult> {
  const res = await fetcher(subscription.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(subscription.endpoint, keys, subject), TTL: String(4 * 3600), Urgency: 'high', 'Content-Length': '0' },
  })
  await res.body?.cancel()
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 }
}
