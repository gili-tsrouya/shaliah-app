// Strict schema for the agent feeds (public/feeds/*.json).
// The feeds are written by AI agents that read arbitrary web pages, so everything in them is untrusted.
// Used twice: in CI before a feed is published, and in the app when a feed is loaded.
// Unknown fields are dropped, items that break the rules are dropped, and only https links survive.
import type { Feed, FeedItem } from './types'

export type FeedKind = 'deals' | 'shlichut'

export const FEED_CATEGORIES: Record<FeedKind, readonly string[]> = {
  deals: ['אוכל', 'יציאות', 'מבצעים', 'תרבות', 'ספורט', 'קהילה'],
  shlichut: ['פרשת השבוע', 'חגים ומועדים', 'ישראל', 'העולם היהודי'],
}

export const MAX_ITEMS = 60

// Longest allowed value per text field; anything longer is a sign the agent went off track
const TEXT_LIMITS = { id: 200, title: 200, summary: 600, category: 40, when: 80, where: 200, price: 40, idea: 800 } as const
const ALLOWED_KEYS = new Set([...Object.keys(TEXT_LIMITS), 'date', 'priceValue', 'lat', 'lng', 'url', 'forPartnerships'])

export interface SanitizeResult {
  feed: Feed
  issues: string[]
  // The file as a whole is unusable (not an object, no items array): keep the last good feed instead
  fatal: boolean
}

// Feeds have no use for control characters, tabs or line breaks inside a field
const clean = (s: string) => s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').trim()

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function text(item: Record<string, unknown>, key: keyof typeof TEXT_LIMITS, required: boolean, issues: string[], where: string) {
  const v = item[key]
  if (v === undefined) {
    if (required) issues.push(`${where}: missing ${key}`)
    return { ok: !required, value: undefined }
  }
  if (typeof v !== 'string') {
    issues.push(`${where}: ${key} is not text`)
    return { ok: !required, value: undefined }
  }
  const s = clean(v)
  if (s.length > TEXT_LIMITS[key] || (required && !s)) {
    issues.push(`${where}: ${key} is empty or too long`)
    return { ok: !required, value: undefined }
  }
  return { ok: true, value: s || undefined }
}

function sanitizeItem(raw: unknown, kind: FeedKind, where: string, issues: string[]): FeedItem | null {
  if (!isObject(raw)) {
    issues.push(`${where}: not an object`)
    return null
  }
  for (const k of Object.keys(raw)) if (!ALLOWED_KEYS.has(k)) issues.push(`${where}: dropped unknown field ${k}`)

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    const required = key === 'id' || key === 'title' || key === 'category'
    const r = text(raw, key, required, issues, where)
    if (!r.ok) return null
    if (r.value !== undefined) out[key] = r.value
  }
  if (!FEED_CATEGORIES[kind].includes(out.category as string)) {
    issues.push(`${where}: unknown category`)
    return null
  }

  if (raw.date !== undefined) {
    if (isValidDate(raw.date)) out.date = raw.date
    else issues.push(`${where}: dropped invalid date`)
  }
  if (raw.priceValue !== undefined) {
    const p = raw.priceValue
    if (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 10000) out.priceValue = p
    else issues.push(`${where}: dropped invalid priceValue`)
  }
  if (raw.lat !== undefined || raw.lng !== undefined) {
    const { lat, lng } = raw
    if (typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      out.lat = lat
      out.lng = lng
    } else issues.push(`${where}: dropped invalid coordinates`)
  }
  if (raw.url !== undefined) {
    const u = safeHttpsUrl(raw.url)
    if (u) out.url = u
    else issues.push(`${where}: dropped link that is not a plain https URL`)
  }
  if (raw.forPartnerships !== undefined) {
    if (kind === 'shlichut' && Array.isArray(raw.forPartnerships) && raw.forPartnerships.length <= 20) {
      const fps = raw.forPartnerships.flatMap((fp, j) => {
        const w = `${where}.forPartnerships[${j}]`
        if (!isObject(fp) || typeof fp.id !== 'string' || !fp.id || fp.id.length > 60) {
          issues.push(`${w}: dropped`)
          return []
        }
        for (const k of Object.keys(fp)) if (k !== 'id' && k !== 'idea') issues.push(`${w}: dropped unknown field ${k}`)
        const idea = typeof fp.idea === 'string' && clean(fp.idea).length <= TEXT_LIMITS.idea ? clean(fp.idea) || undefined : undefined
        return [idea ? { id: clean(fp.id), idea } : { id: clean(fp.id) }]
      })
      if (fps.length) out.forPartnerships = fps
    } else issues.push(`${where}: dropped invalid forPartnerships`)
  }
  return out as unknown as FeedItem
}

export function sanitizeFeed(raw: unknown, kind: FeedKind): SanitizeResult {
  const issues: string[] = []
  if (!isObject(raw) || !Array.isArray(raw.items)) {
    return { feed: { updatedAt: null, items: [] }, issues: ['feed is not an object with an items list'], fatal: true }
  }
  for (const k of Object.keys(raw)) if (k !== 'updatedAt' && k !== 'items') issues.push(`dropped unknown top-level field ${k}`)
  let updatedAt: string | null = null
  if (typeof raw.updatedAt === 'string' && raw.updatedAt.length <= 40 && !Number.isNaN(Date.parse(raw.updatedAt))) updatedAt = raw.updatedAt
  else if (raw.updatedAt !== null && raw.updatedAt !== undefined) issues.push('dropped invalid updatedAt')
  if (raw.items.length > MAX_ITEMS) issues.push(`only the first ${MAX_ITEMS} items are kept`)

  const seen = new Set<string>()
  const items: FeedItem[] = []
  raw.items.slice(0, MAX_ITEMS).forEach((it, i) => {
    const item = sanitizeItem(it, kind, `items[${i}]`, issues)
    if (!item) return
    if (seen.has(item.id)) {
      issues.push(`items[${i}]: duplicate id dropped`)
      return
    }
    seen.add(item.id)
    items.push(item)
  })
  return { feed: { updatedAt, items }, issues, fatal: false }
}
