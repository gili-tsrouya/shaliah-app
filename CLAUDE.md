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
The app follows its third row ("גרסה 3 — כמו אפליקציה אמיתית"): Assistant font (bundled via @fontsource), black / grey / white,
color only for the workplaces, grouped lists (`.group`, `.group-row`), large titles, segmented switchers.
Accent color (buttons, active tab, selected chips, progress) is `--accent`, chosen in Settings from `THEMES` in `src/lib/theme.ts`
(`settings.theme`; black when unset). The theme also tints `--ground`, `--hair`, `--track`, `--border` (`themeColors`); cards stay white. Never use an accent close to the workplace blue/orange/green.
Tabs: היום (#/home), יומן (#/calendar), משימות (#/tasks), גילויים (#/drop, #/drop?all, #/activities), לעצמי
(#/self/contacts, #/self/budget, #/journal). `tabOf` in `src/components/Nav.tsx` says which tab a screen belongs to.

## Built
- Home: weather (Open-Meteo, location from agent settings) + what-to-wear icon, budget card, who to call, today/tomorrow events, agent picks, task counts.
- Cheap finds: agent settings panel (distance, max price, topics, free text; saved to `public/agent-settings.json` through the GitHub API with a token the user pastes once), list/map toggle (Leaflet + OpenStreetMap, pins need `lat`/`lng`).
- Budget: one "+ הוצאה" sheet with optional "someone owes me" split and a refund mode; "חייבים לי" list; refunds reduce net spending.
- Stay in touch: photo, ring color by on-time score, last-8 history dots, priority sort, optional phone with WhatsApp (wa.me) and FaceTime video/audio links.
  Morning "who to call" notification (`src/lib/push.ts`, `public/push-sw.js`). Signed in (the normal way): the app registers its
  push subscription, time and time zone with `set_push_reminder`; pg_cron checks every 5 minutes and the `push-reminder`
  function sends a payload-less wake-up (VAPID key made by the function, kept encrypted in `server_keys`; the device flag
  `shaliach-push-server` marks a phone registered this way). The reminder card has a one-tap move for a
  reminder set up the old way (`sendTestPush` in push.ts still exists, no button). GitHub schedules proved unreliable (about two runs a day). Old way, still used when not signed in: the app writes `push/config.json` (subscription, reminder time, time zone) to the private repo `Gili-tsrouya/shaliah-data` with `settings.dataRepoToken`; a workflow there sends a wake-up push at the reminder time and the service worker builds the message from the people list the app mirrors into IndexedDB. Contacts never leave the phone.
  Fixed call days (`src/lib/calls.ts`): a person can have `callDays` (0=Sun…6=Sat) and `callTime`. The next due date is the first chosen weekday once the rhythm minus 3 days has passed (same rule in `public/push-sw.js`). The app calendar shows these calls; when the personal category is linked to Google, one repeating Google event per person is created/updated/deleted (`callEvents` key records which).
  Important phones (`#/self/important`, `src/screens/ImportantContacts.tsx`, key `importantContacts`): supervisor, safety officer, HR…
  role, optional name/phone/email/note, workplace (`tzofim` / `yj` / `general`); call, WhatsApp and mail buttons, 911 pinned on top.
  Opened from a row at the top of שומרים קשר; never part of reminders, rings or streaks. The contact picker and .vcf import also read email.
  Import from the address book (`src/lib/contacts.ts`): the Contact Picker API where the browser has it (Android; iPhone only with Safari's feature flag), otherwise a .vcf file exported from the iPhone Contacts app. Phones are normalized to +972 / +1, duplicates are skipped, new people start with today as last talk.
- Calendar: user-defined categories with colors; each category can be linked to a Google calendar for two-way sync (`src/lib/google.ts`, Google Identity Services token in the browser; Client ID pasted in the app).
  Guests: an event in a Google-linked category can have `guests` (emails); Google sends the invitations, updates and cancellations (`sendUpdates=all` only when there are guests). Replies come back as `status`. `meet: true` asks Google for a Meet link (`meetLink`). Events organized by someone else carry `invitedBy` and `myStatus`; their guest list is never sent back, and her reply goes through `respond` in `src/lib/google.ts` (reads the event, changes only her own `responseStatus`, tells the organizer).
- Shlichut: feed + "בנה פעילות ב-ChatGPT" link + create task.
  Each shlichut item may carry `plan` (goal + methods), built by the agent from the method families in `agents/method-families.md` / `src/lib/methods.ts` (Tzofim "המסע בצופים"). The word in the UI is "מתודה", never "שיטה".
- Tasks (`src/screens/Tasks.tsx`, `src/lib/tasks.ts`): "write it down, then choose three". Quick capture goes to an inbox
  (`inbox: true`), at most three tasks are chosen per day (`plannedFor`, `order`; the first is "קודם כל זה"), the rest is
  "בהמשך" by due date. `status` keeps its meaning (`done` + `doneAt` when completed). A task can reserve time in the
  calendar (`blockEventId`). The first run moved the old board's "בתהליך" tasks into today (`tasksModel` flag).
- Activities (`#/activities`, `#/activity?id=`, `src/lib/activities.ts`): activities built from methods (מתודות) of the
  families in `src/lib/methods.ts`; total length and merged equipment are computed; method bank `methodBank`; built from a
  shlichut idea (with the agent's `plan`) from the deck or the shlichut screen. An activity is a reusable plan: status is only
  draft/ready (the old `done` reads as ready), the date is optional, and every time she runs it is a `runs` entry with its own
  review (`runsOf` reads an old single `review` as one run). A planned day that passed asks "העברת אותה?"; export as PDF (print view
  `#/activity-print`), Word (.doc HTML) and an equipment list, through the share sheet.
- Daily deck (`#/drop`, `src/screens/Drop.tsx`, `src/lib/drop.ts`): items from both feeds that are new or changed since they were last gone through, one card at a time (swipe right or bookmark keeps, left skips), and a "כל התוכן" tab listing everything with filters. `dropSeen` records what was seen and the item's date/time/place/price then, so a changed item comes back marked "עודכן"; `savedIdeas` holds kept shlichut items (deals keep using `savedDeals`). Home shows the count. The Deals and Shlichut screens stay as they are.
- Profile (`#/profile`): name, age, home town, budget + saving goal, interests. Age/home/interests go to `public/agent-settings.json` (`age`, `interests`, `homeBase`); the התאמה panel can set a temporary place with `awayUntil`.
- Shlichut partnerships (community types + age range) saved to `public/shlichut-settings.json`; the agent tags items with `forPartnerships`.
- No on-demand run: the agents update every morning (claude.ai routines); screens say changes apply the next morning.
- Everything under `public/` is public: keep personal details (name, budget) out of it.

## Account and backend (in progress)
- Supabase project `iidxjorwnsvtlhivymuv` (one project, real data). Schema in `supabase/migrations/`, server functions in `supabase/functions/`, tests in `supabase/tests/`.
- `.github/workflows/backend.yml` (branch `migration`): tests everything on a throwaway local copy, then applies migrations and deploys functions. Never run tests against the hosted project.
- `#/account` (`src/screens/Account.tsx`, `src/lib/cloud.ts`): sign in with Google. The phone stays the source of truth and works offline; a signed-in device backs up automatically (`backupIfNeeded` in `App.tsx`, RPC `sync_phone_snapshot`) when something changed, but only the device the account's copy came from, so two devices cannot overwrite each other silently. "שחזור מהחשבון" brings the latest snapshot onto a new phone through `restoreBackup` and makes that phone the one that backs up. Keys without the `shaliach:` prefix (`shaliach-device`, `shaliach-synced`, `shaliach-claim`, `shaliach-account`) are per device and never travel in a backup.
- `.env.production` holds the project address and the publishable key (public by design). No other key may ever be in the app or the repo.
- Google Calendar, lasting connection: "חיבור קבוע" in the calendar settings sends the browser to Google once (`google-connect-start` → `google-connect-callback`); the refresh token is encrypted in `google_connections` and never leaves the server. The app's own two-way sync (`src/lib/google.ts`) then gets a one-hour access token from `google-token` whenever it needs one (`serverToken`), instead of asking Google again every hour. The older in-browser connect (pasted Client ID) still works as a fallback.
- `google_connections.sync_mode`: `browser` (default) means the app writes the calendar; `server` means the `sync_outbox` / `google-sync` path writes it. Never let both write one user's events: Google would get each event twice. The outbox refuses rows for `browser` connections.
- Journal (`#/journal`, `src/screens/Journal.tsx`, `src/lib/journal.ts`): notes with photos, kept in the account (tables `memories`, `photos`; files in the private bucket `media` at `<user>/<memory>/<photo>/display.jpg`, shown only through short-lived signed links). Needs a signed-in device and a connection; only the text being written is kept locally as a draft. Photos of a shlichut memory are flagged `may_show_minors` by the database and must never be offered for sharing or export.
- Look back (`#/recap`, `src/screens/Recap.tsx`): the last week or a month, computed on the phone from events, expenses, people talked to and kept deck items, plus journal memories and photos when signed in. It only counts things with a real date; it has no share or export.
- The deck orders new items by what she tends to keep (`tastes` in `src/lib/drop.ts`); nothing is hidden. When a round is finished and a GitHub token is set, `dealTaste` (category names only) is written to `public/agent-settings.json` as `taste`, which `agents/deals-agent.md` uses; the same for shlichut idea categories in `public/shlichut-settings.json` (`shlichutTaste`, `agents/shlichut-agent.md`).
- Monthly summary (`#/wrapped?back=N`, `src/screens/Wrapped.tsx`): full-screen slides for a month, opened from the look-back screen. A slide appears only when there is dated data for it. The journey slide uses `profile.shlichutStart` / `shlichutEnd`, which stay on the phone and are never published.
- Call log (`src/lib/talks.ts`): `Person.talks` holds one date per day with a logged call (from 17 Nov 2026; older calls are only in `lastTalk` / `history`). Every way of logging a call adds to it, and so does moving "last talk" to a later day in the edit form. It feeds the weekly streak (Sunday–Saturday weeks with at least one call), the call counts in the look-back and monthly summary, and `src/components/Celebrate.tsx`, shown after the explicit "we talked" button.
- Backups and health checks of the project run from the private repo `shaliah-data`.

## Agents
Prompts in `agents/deals-agent.md` and `agents/shlichut-agent.md`. Run daily (e.g. a Claude Code scheduled routine on the repo): follow the prompt, write the feed JSON, commit and push to `main` (which redeploys).
