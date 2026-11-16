// Turning a shlichut feed item into a ready-made ChatGPT request
import type { FeedItem, Partnership } from './types'

export const audienceText = (p: Partnership) =>
  `${p.community.length ? `קהילה ${p.community.join(' / ')}` : 'נוער יהודי בתפוצות'}, גילאי ${p.ageFrom}–${p.ageTo}` +
  (p.notes ? ` (${p.notes})` : '')

// Opens ChatGPT with the request already typed in; Gili only presses send
export const chatGptUrl = (i: FeedItem, idea: string | undefined, p: Partnership | undefined) =>
  'https://chatgpt.com/?q=' + encodeURIComponent(
    `כתוב לי פעילות בנושא: ${i.title}. הקהל: ${p ? audienceText(p) : 'נוער יהודי בתפוצות (גילאי 13–18)'}.` +
    (idea ? ` כיוון אפשרי: ${idea}.` : '') +
    ' התאם את התוכן והשפה לקהל הזה. כלול מטרות, פתיחה, משחק או דיון, שאלות לשיחה, סיכום, משך כולל של כשעה ורשימת ציוד.',
  )
