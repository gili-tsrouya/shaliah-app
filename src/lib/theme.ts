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

export function applyTheme(id?: string) {
  const t = themeOf(id)
  document.documentElement.style.setProperty('--accent', t.accent)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F1F2F4')
}
