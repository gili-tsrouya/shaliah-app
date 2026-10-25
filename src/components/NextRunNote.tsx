import { Icon } from './Icon'

// The agents run every morning on the Claude routines; changed preferences are picked up on the next run
export function NextRunNote() {
  return (
    <div className="row small muted" style={{ gap: 6 }} role="note">
      <Icon name="sync" size={14} />
      <span>הסוכן מתעדכן כל בוקר. שינויים בהעדפות ייכנסו בעדכון של מחר בבוקר.</span>
    </div>
  )
}
