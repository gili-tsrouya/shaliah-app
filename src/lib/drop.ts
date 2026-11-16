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

export function newItems(all: DropItem[], seen: Record<string, DropSeen>): DropItem[] {
  return all
    .filter(({ item }) => !seen[item.id] || seen[item.id].mark !== markOf(item))
    .map((d) => ({ ...d, changed: !!seen[d.item.id] }))
}
