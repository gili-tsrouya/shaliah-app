import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { findAgentRun, startAgentRun } from '../lib/github'
import { Icon } from './Icon'

type Agent = 'deals' | 'shlichut'
type Phase = 'idle' | 'starting' | 'running' | 'done' | 'failed' | 'error'

// Remembered per agent so the "running" note survives closing the app
const KEY = (a: Agent) => `shaliach:agentRun:${a}`
const readSince = (a: Agent) => {
  try {
    return localStorage.getItem(KEY(a))
  } catch {
    return null
  }
}
const writeSince = (a: Agent, v: string | null) => {
  try {
    if (v) localStorage.setItem(KEY(a), v)
    else localStorage.removeItem(KEY(a))
  } catch {
    // the note just won't survive a restart
  }
}

// Saves the latest preferences, starts the agent on GitHub Actions and shows its progress
export function RunAgent({ agent, beforeRun }: { agent: Agent; beforeRun?: () => Promise<void> }) {
  const { settings } = useStore()
  const token = settings.githubToken
  const [since, setSince] = useState(() => readSince(agent))
  const [phase, setPhase] = useState<Phase>(since ? 'running' : 'idle')
  const [msg, setMsg] = useState('')

  const check = useCallback(async () => {
    if (!since || !token) return
    try {
      const run = await findAgentRun(token, agent, since)
      if (!run || run.status !== 'completed') return setPhase('running')
      if (run.conclusion !== 'success') {
        setPhase('failed')
        writeSince(agent, null)
        return
      }
      // The app is republished a couple of minutes after the agent finishes
      setPhase('done')
    } catch {
      // try again on the next tick
    }
  }, [agent, since, token])

  useEffect(() => {
    if (!since) return
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [since, check])

  const run = async () => {
    if (!token) {
      setPhase('error')
      setMsg('כדי להריץ מהאפליקציה צריך טוקן GitHub (גילויים בזול ← התאמה ← חיבור ל-GitHub).')
      return
    }
    setPhase('starting')
    setMsg('')
    try {
      await beforeRun?.()
      const now = new Date(Date.now() - 60_000).toISOString()
      await startAgentRun(token, agent)
      writeSince(agent, now)
      setSince(now)
      setPhase('running')
    } catch (e) {
      setPhase('error')
      const code = (e as Error).message
      setMsg(code === '403' || code === '404'
        ? 'לטוקן של GitHub אין הרשאה להפעיל את הסוכן. צריך להוסיף לו "Actions: Read and write".'
        : 'לא הצלחתי להפעיל את הסוכן. בדקו את החיבור ונסו שוב.')
    }
  }

  const finish = () => {
    writeSince(agent, null)
    location.reload()
  }

  if (phase === 'running' || phase === 'starting') {
    return (
      <div className="card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, background: 'var(--tzofim-bg)', borderColor: 'transparent', color: 'var(--tzofim-fg)' }} role="status">
        <Icon name="sync" size={18} />
        <span className="small" style={{ flex: 1 }}>
          {phase === 'starting' ? 'מפעיל את הסוכן…' : 'הסוכן רץ עכשיו ומחפש בשבילך. זה לוקח 5–15 דקות — אפשר לסגור את האפליקציה, התוצאות יחכו כאן.'}
        </span>
      </div>
    )
  }
  if (phase === 'done') {
    return (
      <button className="card row" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, background: 'var(--personal-bg)', borderColor: 'transparent', color: 'var(--personal-fg)', textAlign: 'start' }} onClick={finish}>
        <Icon name="check" size={18} />
        <span className="small bold" style={{ flex: 1 }}>הסוכן סיים! התוצאות החדשות עולות לאפליקציה תוך 2–3 דקות. לחצו כאן לרענון.</span>
      </button>
    )
  }
  return (
    <div className="col" style={{ gap: 4 }}>
      <button className="btn light row" style={{ justifyContent: 'center', gap: 6 }} onClick={run}>
        <Icon name="sync" size={16} /> הרץ את הסוכן עכשיו
      </button>
      {phase === 'failed' && <span className="small" style={{ color: 'var(--danger)' }}>ההרצה האחרונה נכשלה. נסו שוב, ואם זה חוזר — ספרו לי.</span>}
      {phase === 'error' && msg && <span className="small" style={{ color: 'var(--danger)' }}>{msg}</span>}
    </div>
  )
}
