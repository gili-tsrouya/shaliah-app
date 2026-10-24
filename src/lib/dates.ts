const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayISO = () => toISO(new Date())

export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s: string, n: number) => {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const daysBetween = (from: string, to: string) =>
  Math.round((fromISO(to).getTime() - fromISO(from).getTime()) / 86400000)

export const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export const formatDay = (s: string) => {
  const d = fromISO(s)
  return `${d.getDate()} ב${MONTHS[d.getMonth()]}`
}

export const formatLongDay = (s: string) => `יום ${DAY_NAMES[fromISO(s).getDay()]}, ${formatDay(s)}`

export const monthKey = (s: string) => s.slice(0, 7)

export const daysLeftInMonth = (s: string) => {
  const d = fromISO(s)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return last - d.getDate() + 1
}

// Sunday of the week containing s
export const weekStart = (s: string) => addDays(s, -fromISO(s).getDay())

// Converts a local HH:mm (today) to the time in Israel.
export const israelTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })
}

export const agoText = (days: number) =>
  days <= 0 ? 'היום' : days === 1 ? 'אתמול' : `לפני ${days} ימים`

export const inDaysText = (days: number) => (days === 1 ? 'יום' : `${days} ימים`)
