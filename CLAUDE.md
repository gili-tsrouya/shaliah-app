# השליח (Shaliach app)

Personal Hebrew (RTL) PWA for Gili, an Israeli fellow of the Jewish Agency living in New Jersey for ~2 years.
Two workplaces: **צופים** (blue) and **Young Judaea** (orange), plus **אישי** (green).

- Stack: Vite + React + TypeScript, `vite-plugin-pwa`. No backend. Data lives in `localStorage` (`src/lib/store.tsx`).
- Hash routes in `src/App.tsx`; screens in `src/screens/`; shared UI in `src/components/`.
- Deployed to GitHub Pages at https://gili-tsrouya.github.io/shaliah-app/ by `.github/workflows/deploy.yml` (base path `/shaliah-app/`).
- Agent feeds: `public/feeds/deals.json` and `public/feeds/shlichut.json` (`{ updatedAt, items: FeedItem[] }`, see `src/lib/types.ts`). A daily scheduled agent is meant to search the web and commit new items there.
- All UI copy is Hebrew. Money is USD. Show Israel time next to local time where calls are involved.

## Rule: never lose Gili's saved data
All personal data lives in the phone's `localStorage` under keys starting with `shaliach:` (see `src/lib/store.tsx`).
Code updates must keep it readable:
- Never rename or remove a storage key or an existing field, and never change what a field means. Add new fields as optional.
- If a format really must change, add a migration that converts the old data on load, and keep reading the old shape.
- Keep existing ids (e.g. category ids `tzofim`, `yj`, `personal`) so saved tasks and events stay linked.
- Keep the backup format (`src/lib/backup.ts`) restorable: a backup made by an older version must still import.
- Never change the app's address (repo name / `base` in `vite.config.ts`) without a plan to move the data first; storage is per address.

## Design source
The approved design is a Claude Design canvas: https://claude.ai/artifact/RQ2ygpVUiZ8viiNRd7VEsP
Match its colors, spacing and copy.

## Built
- Home: weather (Open-Meteo, location from agent settings) + what-to-wear icon, budget card, who to call, today/tomorrow events, agent picks, task counts.
- Cheap finds: agent settings panel (distance, max price, topics, free text; saved to `public/agent-settings.json` through the GitHub API with a token the user pastes once), list/map toggle (Leaflet + OpenStreetMap, pins need `lat`/`lng`).
- Budget: one "+ הוצאה" sheet with optional "someone owes me" split and a refund mode; "חייבים לי" list; refunds reduce net spending.
- Stay in touch: photo, ring color by on-time score, last-8 history dots, priority sort, optional phone with WhatsApp (wa.me) and FaceTime video/audio links.
- Calendar: user-defined categories with colors; each category can be linked to a Google calendar for two-way sync (`src/lib/google.ts`, Google Identity Services token in the browser; Client ID pasted in the app).
- Shlichut: feed + "בנה פעילות ב-ChatGPT" link + create task.
- Tasks board.

## Agents
Prompts in `agents/deals-agent.md` and `agents/shlichut-agent.md`. Run daily (e.g. a Claude Code scheduled routine on the repo): follow the prompt, write the feed JSON, commit and push to `main` (which redeploys).
