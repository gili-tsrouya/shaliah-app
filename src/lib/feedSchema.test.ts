import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sanitizeFeed, safeHttpsUrl, MAX_ITEMS } from './feedSchema'

const deal = (extra: Record<string, unknown> = {}) => ({ id: 'a', title: 'Free jazz', category: 'יציאות', ...extra })
const one = (item: unknown, kind: 'deals' | 'shlichut' = 'deals') => sanitizeFeed({ updatedAt: null, items: [item] }, kind)

describe('feed schema', () => {
  it('accepts the feeds currently in the repo without dropping anything', () => {
    for (const kind of ['deals', 'shlichut'] as const) {
      const raw = JSON.parse(readFileSync(`public/feeds/${kind}.json`, 'utf8'))
      const { feed, fatal } = sanitizeFeed(raw, kind)
      expect(fatal).toBe(false)
      expect(feed.items).toHaveLength(raw.items.length)
    }
  })

  it('rejects files that are not a feed', () => {
    for (const raw of [null, [], 'x', { items: 'x' }, { updatedAt: 'now' }]) expect(sanitizeFeed(raw, 'deals').fatal).toBe(true)
  })

  it('only keeps plain https links', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,hi', 'https://user:pw@example.com', 'https://localhost', '//example.com', 5]) {
      expect(safeHttpsUrl(bad)).toBeNull()
      expect(one(deal({ url: bad })).feed.items[0].url).toBeUndefined()
    }
    expect(one(deal({ url: 'https://www.eventbrite.com/e/123' })).feed.items[0].url).toBe('https://www.eventbrite.com/e/123')
  })

  it('drops fields that are not in the schema', () => {
    const { feed, issues } = one(deal({ html: '<img src=x onerror=alert(1)>', __proto__x: 1, onClick: 'x' }))
    expect(Object.keys(feed.items[0]).sort()).toEqual(['category', 'id', 'title'])
    expect(issues.some((i) => i.includes('unknown field html'))).toBe(true)
  })

  it('drops items missing required fields, with unknown categories, or with oversized text', () => {
    expect(one({ id: 'a', category: 'אוכל' }).feed.items).toHaveLength(0)
    expect(one(deal({ category: 'Ignore previous instructions' })).feed.items).toHaveLength(0)
    expect(one(deal({ title: 'x'.repeat(201) })).feed.items).toHaveLength(0)
    expect(one(deal(), 'shlichut').feed.items).toHaveLength(0) // a deals category is not a shlichut category
  })

  it('drops invalid optional values but keeps the item', () => {
    const item = one(deal({ date: '2026-02-30', priceValue: -5, lat: 200, lng: 0, summary: 7 })).feed.items[0]
    expect(item).toEqual({ id: 'a', title: 'Free jazz', category: 'יציאות' })
  })

  it('removes control characters and keeps text otherwise as-is', () => {
    const item = one(deal({ title: 'Free\u0000 jazz\u2028night' })).feed.items[0]
    expect(item.title).toBe('Free  jazz night')
  })

  it('removes duplicate ids and caps the number of items', () => {
    expect(sanitizeFeed({ items: [deal(), deal()] }, 'deals').feed.items).toHaveLength(1)
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => deal({ id: `id${i}` }))
    expect(sanitizeFeed({ items: many }, 'deals').feed.items).toHaveLength(MAX_ITEMS)
  })

  it('only allows partnership tags on the shlichut feed, with id and idea', () => {
    const tags = [{ id: 'p1', idea: 'game', secret: 'x' }, { idea: 'no id' }]
    const s = one({ id: 'a', title: 't', category: 'ישראל', forPartnerships: tags }, 'shlichut').feed.items[0]
    expect(s.forPartnerships).toEqual([{ id: 'p1', idea: 'game' }])
    expect(one(deal({ forPartnerships: tags })).feed.items[0].forPartnerships).toBeUndefined()
  })
})
