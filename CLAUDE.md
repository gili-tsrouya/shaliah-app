# השליח (Shaliach app)

Personal Hebrew (RTL) PWA for Gili, an Israeli fellow of the Jewish Agency living in New Jersey for ~2 years.
Two workplaces: **צופים** (blue) and **Young Judaea** (orange), plus **אישי** (green).

- Stack: Vite + React + TypeScript, `vite-plugin-pwa`. No backend. Data lives in `localStorage` (`src/lib/store.tsx`).
- Hash routes in `src/App.tsx`; screens in `src/screens/`; shared UI in `src/components/`.
- Deployed to GitHub Pages at https://gili-tsrouya.github.io/shaliah-app/ by `.github/workflows/deploy.yml` (base path `/shaliah-app/`).
- Agent feeds: `public/feeds/deals.json` and `public/feeds/shlichut.json` (`{ updatedAt, items: FeedItem[] }`, see `src/lib/types.ts`). A daily scheduled agent is meant to search the web and commit new items there.
- All UI copy is Hebrew. Money is USD. Show Israel time next to local time where calls are involved.

## Design source
The approved design is a Claude Design canvas: https://claude.ai/artifact/RQ2ygpVUiZ8viiNRd7VEsP
Match its colors, spacing and copy.

## Built so far
Home, cheap finds (feed list), budget (expenses, editable categories and stipend), stay in touch (people, frequency, "we talked"), shlichut feed (create task from item), calendar (3 toggleable categories, events/deadlines/vacations), task board (todo/doing/blocked/done).

## In the design but not built yet
1. Home: weather card + what-to-wear icon (t-shirt / light jacket / coat / umbrella) from a real forecast (e.g. Open-Meteo, no API key).
2. Cheap finds: agent settings (distance 5/10/25 mi/incl. NYC, max price, topics, free text) and a list/map toggle with price pins around home.
3. Budget: one "+ הוצאה" button opening a sheet with an optional "someone owes me part of this" split, and a refund mode ("קיבלתי כסף בחזרה"); "חייבים לי" list with "קיבלתי"; refunds reduce net spending; recent movements show refunds in green.
4. Stay in touch: profile photo, ring color by on-time score, last-8 history dots (green on time / yellow a bit late / red very late), priority sort by overdue ratio, optional phone with WhatsApp (opens chat via wa.me), WhatsApp video and FaceTime (`facetime:` / `facetime-audio:`) buttons.
5. Calendar: user-defined extra categories with a color picker; two-way Google Calendar sync (needs a Google Cloud OAuth client).
6. Shlichut: "בנה פעילות ב-ChatGPT" button per item → `https://chatgpt.com/?q=` + encoded Hebrew prompt asking for a youth activity on that topic.
7. Daily agents (deals + shlichut) that update the feed JSON files.
