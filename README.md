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
