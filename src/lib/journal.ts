// The journal: short notes and photos about a day. Unlike the rest of the app it lives in the account
// (photos need real storage), so it needs a signed-in device and a connection.
// Photos are private files: they are only ever shown through short-lived links made for the owner.
import { cloud, currentSession } from './cloud'

export type MemoryKind = 'personal' | 'shlichut'

export interface JournalPhoto {
  id: string
  memoryId: string
  path: string
  url?: string // short-lived, made when the list is loaded
  width?: number
  height?: number
  youth: boolean // may show minors: stays inside the app, never offered for sharing
}

export interface Memory {
  id: string
  date: string // yyyy-mm-dd
  body: string
  mood?: string
  kind: MemoryKind
  eventTitle?: string
  photos: JournalPhoto[]
}

export const MOODS = ['מעולה', 'טוב', 'רגיל', 'קשה'] as const

const pathOf = (userId: string, memoryId: string, photoId: string) => `${userId}/${memoryId}/${photoId}/display.jpg`

async function me() {
  const session = await currentSession()
  if (!session) throw new Error('not signed in')
  return session.user.id
}

interface Row {
  id: string; date: string; body: string | null; mood: string | null; kind: MemoryKind; tags: string[]
  photos: { id: string; width: number | null; height: number | null; may_show_minors: boolean; deleted_at: string | null; upload_state: string }[]
}

export async function loadMemories(limit = 60): Promise<Memory[]> {
  const db = await cloud()
  const userId = await me()
  const { data, error } = await db.from('memories')
    .select('id, date, body, mood, kind, tags, photos(id, width, height, may_show_minors, deleted_at, upload_state)')
    .is('deleted_at', null).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  const list: Memory[] = (data as unknown as Row[]).map((m) => ({
    id: m.id, date: m.date, body: m.body ?? '', mood: m.mood ?? undefined, kind: m.kind,
    eventTitle: m.tags.find((t) => t.startsWith('event:'))?.slice(6),
    photos: m.photos.filter((p) => !p.deleted_at && p.upload_state === 'uploaded').map((p) => ({
      id: p.id, memoryId: m.id, path: pathOf(userId, m.id, p.id), width: p.width ?? undefined, height: p.height ?? undefined, youth: p.may_show_minors,
    })),
  }))
  const paths = list.flatMap((m) => m.photos.map((p) => p.path))
  if (paths.length) {
    const { data: signed } = await db.storage.from('media').createSignedUrls(paths, 3600)
    const byPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]))
    for (const m of list) for (const p of m.photos) p.url = byPath.get(p.path)
  }
  return list
}

// Phone photos are large; a 1600-pixel JPEG looks the same on a phone and is about a tenth of the size
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.82))
  if (!blob) throw new Error('could not prepare the photo')
  return { blob, width, height }
}

async function sha256Hex(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface NewMemory { date: string; body: string; mood?: string; kind: MemoryKind; eventLegacyId?: string; eventTitle?: string }

// Saves the note first, then each photo. A photo that fails to upload is reported; the note is kept.
export async function saveMemory(input: NewMemory, files: File[], onProgress?: (done: number, of: number) => void) {
  const db = await cloud()
  const userId = await me()
  let eventId: string | null = null
  if (input.eventLegacyId) {
    // the calendar lives on the phone; its copy in the account is found by the phone's id for the event
    const { data } = await db.from('events').select('id').eq('legacy_id', input.eventLegacyId).is('deleted_at', null).limit(1)
    eventId = data?.[0]?.id ?? null
  }
  const { data: row, error } = await db.from('memories').insert({
    user_id: userId, date: input.date, body: input.body.trim() || null, mood: input.mood ?? null, kind: input.kind,
    event_id: eventId, tags: input.eventTitle ? [`event:${input.eventTitle}`] : [],
  }).select('id').single()
  if (error) throw error
  let failed = 0
  for (let i = 0; i < files.length; i++) {
    try {
      const { blob, width, height } = await shrink(files[i])
      const id = crypto.randomUUID()
      const { error: recordError } = await db.from('photos').insert({ id, user_id: userId, memory_id: row.id, width, height, bytes: blob.size, sha256: await sha256Hex(blob), upload_state: 'pending' })
      if (recordError) throw recordError
      const { error: uploadError } = await db.storage.from('media').upload(pathOf(userId, row.id, id), blob, { contentType: 'image/jpeg' })
      await db.from('photos').update({ upload_state: uploadError ? 'failed' : 'uploaded' }).eq('id', id)
      if (uploadError) throw uploadError
    } catch {
      failed++
    }
    onProgress?.(i + 1, files.length)
  }
  return { id: row.id as string, failedPhotos: failed }
}

export async function updateMemoryText(id: string, body: string, mood: string | undefined) {
  const { error } = await (await cloud()).from('memories').update({ body: body.trim() || null, mood: mood ?? null }).eq('id', id)
  if (error) throw error
}

// To the bin, not erased: the row is marked and the photo files are removed from storage
export async function deleteMemory(m: Memory) {
  const db = await cloud()
  const now = new Date().toISOString()
  const { error } = await db.from('memories').update({ deleted_at: now }).eq('id', m.id)
  if (error) throw error
  if (m.photos.length) {
    await db.from('photos').update({ deleted_at: now }).eq('memory_id', m.id)
    await db.storage.from('media').remove(m.photos.map((p) => p.path))
  }
}
