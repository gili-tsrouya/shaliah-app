// Activities built from methods: totals, equipment, timing, building from an agent idea, and export.
import type { Activity, ActivityMethod, ActivityRun, FeedItem } from './types'
import { newId } from './ids'

export const totalMinutes = (a: Activity) => a.methods.reduce((s, m) => s + (Number(m.minutes) || 0), 0)

// All equipment of all methods, merged: the same item named in two methods is listed once
export function equipmentOf(a: Activity) {
  const uses = new Map<string, number>()
  for (const m of a.methods) for (const raw of m.equipment) {
    const item = raw.trim()
    if (item) uses.set(item, (uses.get(item) ?? 0) + 1)
  }
  return [...uses.entries()].map(([name, count]) => ({ name, count }))
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// When each method starts and ends, if the activity has a start time
export function slots(a: Activity) {
  if (!a.start) return a.methods.map(() => null)
  let t = toMin(a.start)
  return a.methods.map((m) => {
    const from = t
    t += Number(m.minutes) || 0
    return `${toHHMM(from)}–${toHHMM(t)}`
  })
}
export const endTime = (a: Activity) => (a.start ? toHHMM(toMin(a.start) + totalMinutes(a)) : undefined)

export function blankActivity(over: Partial<Activity> = {}): Activity {
  const now = new Date().toISOString()
  return { id: newId(), title: '', goal: '', methods: [], status: 'draft', createdAt: now, updatedAt: now, ...over }
}

export const withId = (m: ActivityMethod) => ({ ...m, id: newId(), equipment: [...(m.equipment ?? [])] })

// A shlichut idea becomes a draft activity; when the agent already broke it into methods, they come along
export function fromIdea(item: FeedItem, partnershipId?: string, idea?: string): Activity {
  return blankActivity({
    title: item.title,
    goal: item.plan?.goal ?? idea ?? item.idea ?? '',
    methods: (item.plan?.methods ?? []).map(withId),
    partnershipId,
    date: item.date,
    fromIdeaId: item.id,
  })
}

export const duplicate = (a: Activity): Activity => ({
  ...blankActivity(),
  title: `${a.title} (עותק)`,
  goal: a.goal,
  work: a.work,
  methods: a.methods.map(withId),
})

// ---------- export ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function activityHtml(a: Activity, partnership?: string) {
  const times = slots(a)
  const gear = equipmentOf(a)
  const facts = [
    partnership && `שותפות: ${partnership}`,
    a.ageFrom && a.ageTo && `גילאים: ${a.ageFrom}–${a.ageTo}`,
    a.date && `תאריך: ${a.date.split('-').reverse().join('.')}${a.start ? `, ${a.start}` : ''}`,
    `משך: ${totalMinutes(a)} דקות`,
  ].filter((x): x is string => typeof x === 'string' && x !== '')
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(a.title)}</title>
<style>body{font-family:Assistant,Arial,sans-serif;direction:rtl;max-width:720px;margin:24px auto;padding:0 16px;color:#000;line-height:1.5}
h1{font-size:26pt;margin:0 0 4pt}h2{font-size:15pt;margin:18pt 0 6pt}.facts{color:#444}
.m{border-top:1px solid #ccc;padding:8pt 0}.m h3{font-size:13pt;margin:0}.k{color:#555;font-size:10pt}
ul{padding-inline-start:18pt}</style></head><body>
<h1>${esc(a.title || 'פעילות')}</h1>
<p class="facts">${facts.map(esc).join(' | ')}</p>
${a.goal ? `<h2>מטרה</h2><p>${esc(a.goal)}</p>` : ''}
<h2>מהלך הפעילות</h2>
${a.methods.map((m, i) => `<div class="m"><h3>${i + 1}. ${esc(m.name)}</h3>
<p class="k">${esc(m.family)}, ${m.minutes} דקות${times[i] ? `, ${times[i]}` : ''}</p>
${m.purpose ? `<p><b>למה:</b> ${esc(m.purpose)}</p>` : ''}
${m.content ? `<p><b>מה עושים:</b> ${esc(m.content)}</p>` : ''}
${m.equipment.length ? `<p><b>ציוד:</b> ${m.equipment.map(esc).join(', ')}</p>` : ''}</div>`).join('\n')}
${gear.length ? `<h2>ציוד</h2><ul>${gear.map((g) => `<li>${esc(g.name)}</li>`).join('')}</ul>` : ''}
</body></html>`
}

export const equipmentText = (a: Activity) =>
  [`ציוד ל${a.title || 'פעילות'}`, '', ...equipmentOf(a).map((g) => `- ${g.name}`)].join('\n')

// The phone's share sheet when it can take files, otherwise a download
export async function shareFile(name: string, content: string, type: string) {
  const file = new File([content], name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export const fileSafe = (s: string) => (s || 'פעילות').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)

// ---------- runs ----------
// The times it was run, newest first. An activity saved before runs existed, that was marked "הועברה" or
// had a review, counts as one run (on its date, or on the day it was last changed).
export function runsOf(a: Activity): ActivityRun[] {
  if (a.runs) return [...a.runs].sort((x, y) => y.date.localeCompare(x.date))
  if (a.status === 'done' || a.review) {
    return [{ id: 'legacy', date: a.date ?? a.updatedAt.slice(0, 10), partnershipId: a.partnershipId, ...a.review }]
  }
  return []
}

// "ready" and the old "done" both mean the plan itself is ready to use
export const isReady = (a: Activity) => a.status !== 'draft'

// It was planned for a day that has come, and no run was logged for that day yet
export const awaitingRun = (a: Activity, today: string) =>
  !!a.date && a.date <= today && !runsOf(a).some((r) => r.date === a.date)
