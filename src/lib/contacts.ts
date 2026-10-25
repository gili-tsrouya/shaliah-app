// Bringing people in from the phone's address book.
// Android Chrome (and iPhone with Safari's "Contact Picker API" feature flag on) can open the
// system contact picker. Otherwise Gili exports contacts from the Contacts app as a .vcf file and picks it.

export interface ImportedContact {
  name: string
  phone?: string
  photo?: Blob
}

interface ContactsManager {
  select(props: string[], opts: { multiple: boolean }): Promise<{ name?: string[]; tel?: string[]; icon?: Blob[] }[]>
  getProperties?(): Promise<string[]>
}

const manager = () => (navigator as Navigator & { contacts?: ContactsManager }).contacts

export const pickerSupported = () => !!manager() && 'ContactsManager' in window

export async function pickContacts(): Promise<ImportedContact[]> {
  const m = manager()!
  const available = (await m.getProperties?.()) ?? ['name', 'tel']
  const props = ['name', 'tel', 'icon'].filter((p) => available.includes(p))
  const picked = await m.select(props, { multiple: true })
  return picked
    .map((c) => ({ name: c.name?.[0]?.trim() ?? '', phone: c.tel?.[0] ? normalizePhone(c.tel[0]) : undefined, photo: c.icon?.[0] }))
    .filter((c) => c.name || c.phone)
    .map((c) => ({ ...c, name: c.name || c.phone! }))
}

// Adds a country code so WhatsApp and FaceTime links work: Israeli mobiles get +972, other 10-digit numbers +1.
export function normalizePhone(raw: string) {
  let p = raw.replace(/[^\d+]/g, '')
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (p.startsWith('+')) return p
  if (/^0\d{8,9}$/.test(p)) return '+972' + p.slice(1)
  if (/^\d{10}$/.test(p)) return '+1' + p
  if (/^1\d{10}$/.test(p)) return '+' + p
  return p
}

const decodeQuotedPrintable = (s: string) => {
  const bytes: number[] = []
  const text = s.replace(/=\r?\n/g, '')
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '=' && /^[0-9A-F]{2}$/i.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      bytes.push(text.charCodeAt(i))
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()

const base64ToBlob = (b64: string, type: string) => {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export function parseVCards(text: string): ImportedContact[] {
  // Long lines are folded onto continuation lines that start with a space or tab
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: ImportedContact[] = []
  let cur: { fn?: string; n?: string; tels: { value: string; cell: boolean }[]; photo?: Blob } | null = null

  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    let value = line.slice(colon + 1)
    const [rawKey, ...params] = head.split(';')
    const key = rawKey.replace(/^item\d+\./i, '').toUpperCase()
    const paramText = params.join(';').toUpperCase()
    if (paramText.includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value)

    if (key === 'BEGIN' && value.toUpperCase() === 'VCARD') cur = { tels: [] }
    else if (!cur) continue
    else if (key === 'FN') cur.fn = unescape(value)
    else if (key === 'N') cur.n = unescape(value.split(';').slice(0, 2).reverse().filter(Boolean).join(' '))
    else if (key === 'TEL') cur.tels.push({ value: value.replace(/^tel:/i, ''), cell: /CELL|IPHONE|MOBILE/.test(paramText) })
    else if (key === 'PHOTO' && !cur.photo) {
      try {
        const dataUri = value.match(/^data:([^;]+);base64,(.*)$/i)
        if (dataUri) cur.photo = base64ToBlob(dataUri[2], dataUri[1])
        else if (/ENCODING=(B|BASE64)|BASE64/.test(paramText)) cur.photo = base64ToBlob(value, `image/${/PNG/.test(paramText) ? 'png' : 'jpeg'}`)
      } catch {
        // a broken photo shouldn't stop the import
      }
    } else if (key === 'END' && value.toUpperCase() === 'VCARD') {
      const tel = (cur.tels.find((t) => t.cell) ?? cur.tels[0])?.value
      const phone = tel ? normalizePhone(tel) : undefined
      const name = cur.fn || cur.n || phone
      if (name) out.push({ name, phone, photo: cur.photo })
      cur = null
    }
  }
  return out
}
