// Validates the agent feeds before they are published.
//   vite-node scripts/check-feeds.ts                      check public/feeds/*.json, fail on unusable files
//   vite-node scripts/check-feeds.ts --write              also rewrite them with invalid items and fields removed
//   vite-node scripts/check-feeds.ts --dir incoming --only deals --write --strict
// --strict (used for freshly fetched feeds) also fails when more than half of the items had to be dropped:
// a feed that is mostly invalid points to a broken or manipulated agent run, so the last good copy is kept.
// A feed that is not even a list of items fails the run, so a broken file never replaces a good one.
import { readFileSync, writeFileSync } from 'node:fs'
import { sanitizeFeed, type FeedKind } from '../src/lib/feedSchema'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const write = process.argv.includes('--write')
const strict = process.argv.includes('--strict')
const dir = arg('--dir') ?? 'public/feeds'
const only = arg('--only')
const kinds = (['deals', 'shlichut'] as FeedKind[]).filter((k) => !only || k === only)
let failed = false

for (const kind of kinds) {
  const path = `${dir}/${kind}.json`
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
  const mostlyInvalid = total > 0 && feed.items.length * 2 < total
  console.log(`${strict && mostlyInvalid ? '✗' : '✓'} ${path}: ${feed.items.length}/${total} items kept`)
  for (const issue of issues) console.log(`  - ${issue}`)
  if (strict && mostlyInvalid) {
    failed = true
    continue
  }
  if (write) writeFileSync(path, JSON.stringify(feed, null, 2) + '\n')
}

process.exit(failed ? 1 : 0)
