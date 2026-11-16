// Encrypts Google refresh tokens before they are stored. AES-256-GCM; the key never leaves the
// function's environment, and each value carries the key version it was written with.
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

// Any sufficiently long secret string works as the key material
async function keyFrom(secret: string) {
  if (!secret || secret.length < 32) throw new Error('TOKEN_ENCRYPTION_KEY is missing or too short')
  return crypto.subtle.importKey('raw', await sha256(secret), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export const KEY_VERSION = 1

export async function encryptToken(plain: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), enc.encode(plain)))
  return `v${KEY_VERSION}:${b64(iv)}:${b64(data)}`
}

export async function decryptToken(stored: string, secret: string) {
  const [version, iv, data] = stored.split(':')
  if (version !== `v${KEY_VERSION}` || !iv || !data) throw new Error('stored token has an unknown format')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await keyFrom(secret), unb64(data))
  return dec.decode(plain)
}

// compares without leaking where two strings differ
export function sameSecret(a: string, b: string) {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
