# Screenshot ingestion runbook (FB / WhatsApp / Telegram)

The user drops screenshots of hub announcements into
`data/research/inbox/fb-screenshots/` whenever they happen to see one.
No cadence, no obligation. An agent session turns them into inbox candidates.

## Procedure (agent with vision)

1. List the folder. For each image not yet ingested (check `ingested.json` in the
   same folder — `{ "files": { "<filename>": "<cid>" } }`; create it if missing):
2. Read the image. Extract: hub/program name, place (country + town), dates,
   organizer, any URL or group name VISIBLE in the post. Never invent what is
   not legible — partial data is fine.
3. Build an inbox candidate (see `lib/intake/inbox.ts` types):
   - `cid`: `candidateCid(name, "fb-screenshot")`
   - `evidence`: `[{ "url": "screenshot:<filename>", "asOf": "<today>" }]`
   - `sourceChannel`: `"fb-screenshot"`
   - `providerUrl`: only if a real URL is legible in the post (else null)
   - `dedupe`: via `dedupeVerdict(name, country, directory entries)`
   - `notes`: one line summarizing the post (who/what/when)
4. Skip candidates whose normalized name is in `data/research/inbox/rejected.json`
   or already in the inbox.
5. Append to `data/research/inbox/candidates.json`, record the filename in
   `ingested.json`, report a summary table.
6. The user reviews via `npm run inbox:review` as with any other channel.
