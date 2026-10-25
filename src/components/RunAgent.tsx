import { useState } from 'react'
import { Icon } from './Icon'

// The cloud routines on claude.ai; their page has a "Run now" button
const ROUTINES = {
  deals: 'https://claude.ai/code/routines/trig_01WsuxzqjuuYymgJothhzDCf',
  shlichut: 'https://claude.ai/code/routines/trig_01A9RoGvKukviuBekXwiSHEj',
}

// Saves the latest preferences first (so the run uses them), then opens the routine to run it now
export function RunAgent({ agent, beforeRun }: { agent: keyof typeof ROUTINES; beforeRun?: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'saving' | 'opened' | 'error'>('idle')
  const run = async () => {
    // Open the tab inside the tap itself, or iOS blocks it as a pop-up
    const tab = window.open('', '_blank')
    setState('saving')
    try {
      await beforeRun?.()
      if (tab) tab.location.href = ROUTINES[agent]
      else location.href = ROUTINES[agent]
      setState('opened')
    } catch {
      tab?.close()
      setState('error')
    }
  }
  return (
    <div className="col" style={{ gap: 4 }}>
      <button className="btn light row" style={{ justifyContent: 'center', gap: 6 }} onClick={run} disabled={state === 'saving'}>
        <Icon name="sync" size={16} /> {state === 'saving' ? 'שומר העדפות…' : 'הרץ את הסוכן עכשיו'}
      </button>
      {state === 'opened' && <span className="muted small">נפתח עמוד הסוכן ב-Claude — לחצו שם "Run now". התוצאות יופיעו כאן תוך 10–15 דקות.</span>}
      {state === 'error' && <span className="small" style={{ color: 'var(--danger)' }}>לא הצלחתי לשמור את ההעדפות ב-GitHub. בדקו את הטוקן בהתאמה.</span>}
    </div>
  )
}
