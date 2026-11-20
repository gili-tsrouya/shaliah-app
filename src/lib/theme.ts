// The app's accent color, chosen by Gili. It colors buttons, the active tab, selected chips and progress.
// Blue, orange and green stay reserved for the three workplaces, so the accents are shades that do not
// look like them. All of them carry white text with enough contrast.
export const THEMES = [
  { id: 'black', name: 'שחור', accent: '#000000' },
  { id: 'graphite', name: 'גרפיט', accent: '#3A3F47' },
  { id: 'navy', name: 'כחול לילה', accent: '#1E2A5A' },
  { id: 'purple', name: 'סגול', accent: '#5B2EB8' },
  { id: 'plum', name: 'שזיף', accent: '#7A1F5C' },
  { id: 'raspberry', name: 'פטל', accent: '#B0174F' },
  { id: 'wine', name: 'יין', accent: '#8A1C2B' },
  { id: 'teal', name: 'טורקיז עמוק', accent: '#0B5E5A' },
  { id: 'brown', name: 'אגוז', accent: '#6B4226' },
] as const

export const themeOf = (id?: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]

// Mix the accent into a neutral grey: the share is how much of the color shows
function tint(hex: string, share: number, base = [244, 245, 247]) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return '#' + c.map((v, i) => Math.round(base[i] + (v - base[i]) * share).toString(16).padStart(2, '0')).join('')
}

// The background of every screen, the dividers and the empty part of progress bars follow the chosen color.
// Black keeps the original greys. Cards stay white so text keeps its contrast.
export function themeColors(id?: string) {
  const t = themeOf(id)
  if (t.id === 'black') return { accent: t.accent, ground: '#F1F2F4', hair: '#ECEDF0', track: '#E2E4E8', border: '#E2E4E8' }
  return { accent: t.accent, ground: tint(t.accent, 0.13), hair: tint(t.accent, 0.08, [255, 255, 255]), track: tint(t.accent, 0.2), border: tint(t.accent, 0.16, [255, 255, 255]) }
}

export function applyTheme(id?: string) {
  const c = themeColors(id)
  const root = document.documentElement.style
  root.setProperty('--accent', c.accent)
  root.setProperty('--ground', c.ground)
  root.setProperty('--hair', c.hair)
  root.setProperty('--track', c.track)
  root.setProperty('--border', c.border)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.ground)
}
