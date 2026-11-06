# Proof of Impact

Measures the value of work, not the number of tasks.

- **Priority Stack:** each manager ranks a person's top 5 for the week.
- **Quality check:** one or two raters rate each delivery.
- **Peer coins:** colleagues give each other coins, shown next to the score.

## Run

```bash
npm install
npm start          # http://localhost:3000
npm test           # scoring unit tests + full API flow
```

Data lives in SQLite under `DATA_DIR` (Embarko sets it; locally `./data`).
`embarko.json` runs `/tasks/hourly` (protected by `CRON_SECRET`) to store weekly scores.

Secrets go only in `.env` (git-ignored) or Embarko's environment settings.

## Phone alerts (M91)

Proof of Impact rings managers' phones only when something waits on them and they may not be looking:

| When | Who is asked | Answers |
|---|---|---|
| Someone has been blocked on a #1 or #2 priority for 4+ hours (configurable) | their manager | I'll unblock it · Blocked by others · Seen |
| Delivered work has waited 2 days for its rating | the rater | I'll rate it today · Seen |
| A team has no locked week by Monday 14:00 | the manager | I'll rank today · Seen |
| A disputed rating has waited 2 days | the rater's manager | I'll decide today · Seen |

**Setup, for each company:**
1. Install M91 ([App Store](https://apps.apple.com/app/id6759090472) · [Google Play](https://play.google.com/store/apps/details?id=com.msg91.m91)).
2. In the app, create a channel and add the managers and TLs.
3. Tap the paper plane on the channel and copy the link.
4. Paste it under **Settings → Phone alerts**.

Everyone in the channel must install M91 and accept the invite, or their phone stays silent.

**How it works:**
- The link is stored encrypted with `APP_SECRET`, a server environment variable, and is never sent back to the browser.
- The hourly job raises new alerts, reads answers back, and closes alerts whose condition has cleared. Any change in the app also closes cleared alerts straight away.
- "Blocked by others" answered from a phone marks the work as blocked by others, so it isn't held against the person.
