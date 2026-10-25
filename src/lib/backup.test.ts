import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBackup, readBackup, restoreBackup, type BackupFile } from './backup'

// Minimal localStorage: stored keys are own enumerable properties, like in browsers, so Object.keys works
class MemoryStorage {
  get length() { return Object.keys(this).length }
  key(i: number) { return Object.keys(this)[i] ?? null }
  getItem(k: string) { return Object.prototype.hasOwnProperty.call(this, k) ? (this as unknown as Record<string, string>)[k] : null }
  setItem(k: string, v: string) { (this as unknown as Record<string, string>)[k] = String(v) }
  removeItem(k: string) { delete (this as unknown as Record<string, string>)[k] }
}

let store: MemoryStorage
const put = (key: string, value: unknown) => store.setItem('shaliach:' + key, JSON.stringify(value))
const get = (key: string) => JSON.parse(store.getItem('shaliach:' + key) ?? 'null')

beforeEach(() => {
  store = new MemoryStorage()
  vi.stubGlobal('localStorage', store)
  vi.stubGlobal('location', { reload: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

describe('backup and restore', () => {
  it('backs up every app key, without tokens or caches', () => {
    put('settings', { name: 'A', monthlyBudget: 2000, githubToken: 'secret-gh' })
    put('tasks', [{ id: 't1', title: 'x' }])
    put('people', [{ id: 'p1', name: 'Savta' }])
    put('googleToken', { token: 'secret-google', exp: 1 })
    put('weather', { at: 1 })
    store.setItem('other-app', 'x')

    const b = buildBackup()
    expect(Object.keys(b.data).sort()).toEqual(['people', 'settings', 'tasks'])
    expect(JSON.stringify(b)).not.toContain('secret-')
    expect(b.data.settings).toEqual({ name: 'A', monthlyBudget: 2000 })
  })

  it('restores a backup and keeps the GitHub token already on the phone', () => {
    put('settings', { name: 'Old', githubToken: 'phone-token' })
    put('expenses', [{ id: 'gone' }])
    const backup: BackupFile = { app: 'shaliach', version: 1, createdAt: '2026-10-01T00:00:00Z', data: { settings: { name: 'New' }, tasks: [{ id: 't' }] } }

    restoreBackup(backup)
    expect(get('settings')).toEqual({ name: 'New', githubToken: 'phone-token' })
    expect(get('tasks')).toEqual([{ id: 't' }])
    expect(get('expenses')).toBeNull() // restore replaces, like before
    expect(location.reload).toHaveBeenCalled()
  })

  it('round-trips the data exactly', () => {
    put('settings', { name: 'A' })
    put('calCategories', [{ id: 'tzofim', label: 'צופים', color: 'blue' }])
    const b = JSON.parse(JSON.stringify(buildBackup())) as BackupFile
    store = new MemoryStorage()
    vi.stubGlobal('localStorage', store)
    restoreBackup(b)
    expect(get('calCategories')).toEqual([{ id: 'tzofim', label: 'צופים', color: 'blue' }])
  })

  it('still reads a backup made by an older version and rejects other files', async () => {
    const old = { app: 'shaliach', version: 1, createdAt: '2026-10-24T00:00:00Z', data: { settings: { name: 'A' }, googleToken: { token: 'x', exp: 0 } } }
    const file = (o: unknown) => ({ text: async () => JSON.stringify(o) }) as File
    expect((await readBackup(file(old))).data.settings).toEqual({ name: 'A' })
    await expect(readBackup(file({ app: 'other', data: {} }))).rejects.toThrow()
  })
})
