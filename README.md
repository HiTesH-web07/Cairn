# Cairn

*Measure what mattered.* A cairn is a small stack of stones that marks the way: three stones, biggest at the bottom, like a priority stack.

Measures the value of work, not the number of tasks.

- **Priority Stack:** each manager ranks a person's top 5 for the week.
- **Quality check:** one or two raters rate each delivery.
- **Peer coins:** colleagues give each other coins, shown next to the score.

## Stack

A full-stack **Next.js** app (App Router, React 19) on **Node.js**, with **SQLite** for data.

| Layer | What it uses |
|---|---|
| Frontend | Next.js pages and React components in `app/` and `components/` |
| Backend | Next.js route handlers on the Node.js runtime: `app/api/[...path]/route.js` serves every `/api/*` route defined in `server/server.js` |
| Database | SQLite (Node's built-in `node:sqlite`), file under `DATA_DIR` |
| AI chatbot | **Ask Cairn**: a Gemini-powered assistant (`server/gemini.js`, `POST /api/ask`) that explains your week and score from your own data, with a prompt-injection guard and rate limits |
| Integrations | Slack and Keka through viaSocket, phone alerts through M91, email through SMTP |

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm test           # scoring unit tests + full API flow
```

Data lives in SQLite under `DATA_DIR` (Embarko sets it; locally `./data`).
`embarko.json` runs `/tasks/hourly` (protected by `CRON_SECRET`) to store weekly scores.

Secrets go only in `.env` (git-ignored) or Embarko's environment settings.

## Phone alerts (M91)

Cairn rings managers' phones only when something waits on them and they may not be looking:

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

## Slack and Keka (through viaSocket)

An admin connects each once under **Integrations**. The company is the viaSocket "user": the connection ids are
stored encrypted (`APP_SECRET`), never sent to a browser, never logged.

**Slack** sends private direct messages only (nothing is posted in channels). People are matched by exact work email.

| Message | When | To |
|---|---|---|
| Plan this week | first working day, morning | managers with people who have no locked week |
| Your week is ready | a manager locks a week | that person |
| Work to rate | work is delivered | the main rater, and the second rater for the top ranks |
| Today's top item | working days, 10:00 local | people with a locked week and work left (not on leave) |
| Add proof | working days, 19:00 local | people with work left |
| Team summary | last working day, evening | managers (their direct reports' scores) |

Each can be switched off. Messages go through an outbox: once-only, retried up to 4 times, text dropped after sending.

**Keka** is optional (Settings → People & leave source → Keka sync). Only the fields an admin ticks are requested, from a fixed
allow-list (name, work email, manager, department, job title, mobile number). Salary, payroll, bank, tax, documents, personal
email, birth date and attendance are never requested. People leave only when Keka marks them **Relieved** (never because they are
missing from a list), at most 10 per run, and owners and admins are never removed by it. **Preview sync** runs everything and rolls
it back, so the numbers are exact. The nightly sync starts after the first manual one.

Pinned versions (copied from viaSocket's action pages, checked against the live listing when connecting):
Slack `Get_User_Information` v9, `Send_Direct_Message` v3; Keka `Find_Employees` v36.

## Settings (environment variables)

Names only. Values go in `.env` (git-ignored) or the host's environment settings, never in the code.

| Name | What for |
|---|---|
| `APP_SECRET` | Encrypts stored connection ids and the phone-alert link |
| `CRON_SECRET` | Protects `/tasks/hourly` |
| `DATA_DIR` | Where the SQLite database lives |
| `VIASOCKET_ORG_ID`, `VIASOCKET_PROJECT_ID`, `VIASOCKET_EMBED_SECRET` | Slack and Keka through viaSocket |
| `M91_SEND_LINK`, `M91_BLOCKER_ESCALATION_HOURS` | Phone alerts (the link can also be set per workspace) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Password reset emails |
| `GEMINI_API_KEY` | Ask Cairn, the AI helper (explains scores, never scores anyone) |
| `ENABLE_DEMO_DATA` | Set to `1` only in a demo or development copy. Switches on the demo data routes |
| `RECOVERY_KEY` | Optional break glass reset for whoever runs the server (12 or more characters) |

## Design

Every visual decision is recorded in [`docs/design-decisions.md`](docs/design-decisions.md) and the sign off in [`docs/qa-record.md`](docs/qa-record.md). Styles live in `app/styles/system.css` (tokens and shared parts), `home.css`, `app.css` and the older `style.css`. Icons are Phosphor (MIT), see `public/fonts/LICENSE-phosphor.txt`. Fonts are Geist (OFL), see `public/fonts/LICENSE-geist.txt`.

## Demo data

Not part of the product screens. For development and demos only: set `ENABLE_DEMO_DATA=1` and an admin can `POST /api/demo` to load 12 labelled people with seven weeks of ranked, rated work, and `DELETE /api/demo` to remove them. Without the setting those routes return 404.
