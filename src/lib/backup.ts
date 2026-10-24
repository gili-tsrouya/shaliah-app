// Backup of everything the app keeps on the phone, as one JSON file the user saves to iCloud Drive / Files.
import { todayISO } from './dates'

const PREFIX = 'shaliach:'
const LAST_BACKUP = PREFIX + 'lastBackup'
// Caches and secrets stay out of the file
const SKIP = new Set([PREFIX + 'weather', LAST_BACKUP])

interface BackupFile { app: 'shaliach'; version: 1; createdAt: string; data: Record<string, unknown> }

export function buildBackup(): BackupFile {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    if (!key.startsWith(PREFIX) || SKIP.has(key)) continue
    try {
      data[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key)!)
    } catch {
      // skip anything that is not ours
    }
  }
  if (data.settings && typeof data.settings === 'object') {
    data.settings = { ...(data.settings as Record<string, unknown>), githubToken: undefined }
  }
  return { app: 'shaliach', version: 1, createdAt: new Date().toISOString(), data }
}

// Opens the iPhone share sheet ("Save to Files") when possible, otherwise downloads the file
export async function exportBackup() {
  const name = `shaliach-backup-${todayISO()}.json`
  const file = new File([JSON.stringify(buildBackup(), null, 2)], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'גיבוי השליח' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
      throw e
    }
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }
  localStorage.setItem(LAST_BACKUP, todayISO())
  return true
}

export async function readBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as Partial<BackupFile>
  if (parsed.app !== 'shaliach' || !parsed.data || typeof parsed.data !== 'object') throw new Error('זה לא קובץ גיבוי של השליח')
  return parsed as BackupFile
}

// Replaces the app's data with the backup; the GitHub token already on this phone is kept
export function restoreBackup(b: BackupFile) {
  const token = (JSON.parse(localStorage.getItem(PREFIX + 'settings') || '{}') as { githubToken?: string }).githubToken
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX) && !SKIP.has(key)) localStorage.removeItem(key)
  }
  for (const [key, value] of Object.entries(b.data)) {
    const v = key === 'settings' && token ? { ...(value as object), githubToken: token } : value
    localStorage.setItem(PREFIX + key, JSON.stringify(v))
  }
  location.reload()
}

export const lastBackup = () => {
  try {
    return localStorage.getItem(LAST_BACKUP)
  } catch {
    return null
  }
}
