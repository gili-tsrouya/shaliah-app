// Validates the agent feeds before they are published.
//   vite-node scripts/check-feeds.ts             check public/feeds/*.json, fail on unusable files
//   vite-node scripts/check-feeds.ts --write     also rewrite them with invalid items and fields removed
// A feed that is not even a list of items fails the run, so a broken file never replaces a good one.
import { readFileSync, writeFileSync } from 'node:fs'
import { sanitizeFeed, type FeedKind } from '../src/lib/feedSchema'

const write = process.argv.includes('--write')
let failed = false

for (const kind of ['deals', 'shlichut'] as FeedKind[]) {
  const path = `public/feeds/${kind}.json`
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error(`✗ ${path}: not valid JSON (${(e as Error).message})`)
    failed = true
    continue
  }
  const { feed, issues, fatal } = sanitizeFeed(raw, kind)
  if (fatal) {
    console.error(`✗ ${path}: ${issues.join('; ')}`)
    failed = true
    continue
  }
  const total = Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items: unknown[] }).items.length : 0
  console.log(`✓ ${path}: ${feed.items.length}/${total} items kept`)
  for (const issue of issues) console.log(`  - ${issue}`)
  if (write) writeFileSync(path, JSON.stringify(feed, null, 2) + '\n')
}

process.exit(failed ? 1 : 0)
