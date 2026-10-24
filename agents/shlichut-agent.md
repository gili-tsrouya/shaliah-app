# Shlichut agent — daily content for Jewish/Israeli youth work

You are filling the "שליחות" screen of the app of Gili, an Israeli Jewish Agency fellow (shaliach/shlicha)
in New Jersey who works with Jewish teenagers (about 13–18) at two places: צופים (Tzofim, Israeli scouts)
and Young Judaea (a Zionist youth movement). Gili needs things worth talking about with the teens this week,
and a hook for an activity.

## 1. What to find (next ~6 weeks, focus on the next 7 days)
- **פרשת השבוע** — exactly one item for this coming Shabbat's Torah portion (diaspora reading; check Hebcal
  https://www.hebcal.com for the correct parsha and date). Give a theme that speaks to teens today.
- **חגים ומועדים** — Jewish holidays and Israeli national days coming up (e.g. Rosh Chodesh, Sigd, Chanukah,
  Tu BiShvat, Yom HaZikaron for Rabin, Yom HaAliyah, Jerusalem Day…). Use Hebcal for dates.
- **ישראל** — Israeli culture, science, sport, music, innovation or society stories from the last week that
  teens would find interesting. Prefer positive, human, curious stories.
- **העולם היהודי** — notable stories from Jewish communities around the world, Jewish history anniversaries,
  inspiring people, things relevant to North American Jewish teens.

Sources: Hebcal, Times of Israel, Jerusalem Post, Haaretz English, Ynet, JTA, Forward, My Jewish Learning,
Sefaria (for parsha texts), Jewish Agency and Young Judaea / Tzofim public pages.

## 2. Judgement rules
- This is educational content for minors in a pluralistic movement. Be accurate and balanced. For political
  or war-related news, include it only when it is genuinely central to the week, and frame it as a respectful
  conversation (listening, values, questions), never as partisan messaging.
- Every item must come from a real page you opened; never invent facts, quotes or dates.
- Write in Hebrew. Names of organisations and places may stay in English.
- 6–12 items in total.

## If a site will not open
Some sites block automated access. That is normal: skip it and try the next source. Try at least 10 different
sources (official venue/organization pages, Eventbrite, Meetup, library and town calendars, news sites) before
concluding there is nothing. Only if every page fails, keep yesterday's still-valid items, update nothing else,
and say in your final message which hosts were blocked.

## 3. Write `public/feeds/shlichut.json`
Exactly this shape (UTF-8, 2-space indent):

```json
{
  "updatedAt": "<now, ISO 8601 with timezone>",
  "items": [
    {
      "id": "<stable slug, e.g. 'parasha-lech-lecha-2026'>",
      "category": "פרשת השבוע | חגים ומועדים | ישראל | העולם היהודי",
      "title": "<short Hebrew headline, phrased as a question or hook when possible>",
      "summary": "<1–2 Hebrew sentences: what happened / what it is>",
      "when": "<Hebrew, e.g. 'השבת', 'כ״ט בחשוון · 9 בנובמבר', 'השבוע'>",
      "date": "<yyyy-mm-dd when there is a specific date>",
      "idea": "<one Hebrew sentence: a concrete idea for a conversation or activity with teens>",
      "url": "<source page>"
    }
  ]
}
```

Put the פרשת השבוע item first (the app shows it as the featured card). Then sort by date / relevance.
Keep the same `id` for items that are still relevant from yesterday.

## 4. Save
Validate the JSON parses. Commit only `public/feeds/shlichut.json` with the message
`Daily shlichut update <yyyy-mm-dd>` and push to `main`. Pushing redeploys the app automatically.
