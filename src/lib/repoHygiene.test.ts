// Guards for what this public repository may contain and publish
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

describe('public repository hygiene', () => {
  it('serves only icons and the agent feeds from public/ (everything there is published to the web)', () => {
    const allowed = new Set([
      'public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png', 'public/icon.svg',
      'public/feeds/deals.json', 'public/feeds/shlichut.json',
    ])
    const extra = walk('public').map((p) => p.split('\\').join('/')).filter((p) => !allowed.has(p))
    expect(extra).toEqual([])
  })

  it('never writes to the app repository from the frontend', () => {
    const code = walk('src').filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts')).map((p) => readFileSync(p, 'utf8')).join('\n')
    expect(code).not.toMatch(/api\.github\.com\/repos\/[^/]+\/shaliah-app/i)
  })

  it('keeps server-side secrets out of frontend environment variables', () => {
    const code = walk('src').filter((p) => /\.tsx?$/.test(p)).map((p) => readFileSync(p, 'utf8')).join('\n')
    expect(code).not.toMatch(/import\.meta\.env\.VITE_\w*(KEY|TOKEN|SECRET)/i)
  })
})
