// The daily deck: what is new since Gili last went through it, from both feeds.
import { inNyc, milesBetween, rangeOf } from './derive'
import { currentPlace } from './places'
import type { AgentSettings, DropSeen, FeedItem } from './types'

export interface DropItem {
  item: FeedItem
  type: 'shl' | 'deal'
  changed: boolean // seen before, but the agent has changed its time, place or price since
}

// The parts of an item that matter for showing up: if one of them changes, the item is worth a second look
export const markOf = (i: FeedItem) => [i.date ?? '', i.when ?? '', i.where ?? '', i.price ?? ''].join('|')

export const isFree = (d: FeedItem) => d.priceValue === 0 || d.price === 'חינם'

// The same rule the finds screen uses: nothing that already happened, is too expensive or too far
export function dealFits(d: FeedItem, a: AgentSettings, today: string) {
  if (d.date && d.date < today) return false
  if (a.maxPrice < 999 && d.priceValue != null && d.priceValue > a.maxPrice) return false
  if (d.lat != null && d.lng != null) {
    const here = currentPlace(a)
    const range = rangeOf(a)
    const p = { lat: d.lat, lng: d.lng }
    if (milesBetween(here, p) > range.miles && !(range.nyc && inNyc(p))) return false
  }
  return true
}

export function allItems(shlichut: FeedItem[], deals: FeedItem[], a: AgentSettings, today: string): DropItem[] {
  const shl = shlichut.filter((i) => !i.date || i.date >= today).map((item) => ({ item, type: 'shl' as const, changed: false }))
  const dl = deals.filter((d) => dealFits(d, a, today)).map((item) => ({ item, type: 'deal' as const, changed: false }))
  // one from each in turn, so the deck does not read as two separate lists
  const out: DropItem[] = []
  for (let i = 0; i < Math.max(shl.length, dl.length); i++) {
    if (shl[i]) out.push(shl[i])
    if (dl[i]) out.push(dl[i])
  }
  return out
}

// How much she tends to keep each category, from her own choices in the deck: +1 for kept, -1 for skipped
export function tastes(all: DropItem[], seen: Record<string, DropSeen>) {
  const score = new Map<string, number>()
  for (const { item, type } of all) {
    const s = seen[item.id]
    if (!s) continue
    const key = `${type}:${item.category}`
    score.set(key, (score.get(key) ?? 0) + (s.did === 'skip' ? -1 : 1))
  }
  return score
}

export function newItems(all: DropItem[], seen: Record<string, DropSeen>): DropItem[] {
  const score = tastes(all, seen)
  const fresh = all
    .filter(({ item }) => !seen[item.id] || seen[item.id].mark !== markOf(item))
    .map((d) => ({ ...d, changed: !!seen[d.item.id] }))
  // Categories she usually keeps come first; the sort is stable, so equal ones stay in the feeds' order.
  // Nothing is hidden: skipped categories only move to the end.
  return fresh
    .map((d, i) => ({ d, i, s: score.get(`${d.type}:${d.item.category}`) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.d)
}

// A coarse summary of her choices for an agent: categories kept or skipped at least 3 times more than
// the other way round. Category names only; it goes into a public file, like the topics already do.
export function tasteFor(type: 'deal' | 'shl', all: DropItem[], seen: Record<string, DropSeen>) {
  const more: string[] = []
  const less: string[] = []
  for (const [key, n] of tastes(all, seen)) {
    if (!key.startsWith(`${type}:`)) continue
    if (n >= 3) more.push(key.slice(type.length + 1))
    if (n <= -3) less.push(key.slice(type.length + 1))
  }
  return { more: more.sort(), less: less.sort() }
}

export const dealTaste = (all: DropItem[], seen: Record<string, DropSeen>) => tasteFor('deal', all, seen)
