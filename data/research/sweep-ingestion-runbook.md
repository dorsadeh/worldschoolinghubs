# LLM sweep ingestion runbook

After running a sweep (`npm run discover:sweep-prompt` → paste into ChatGPT/Gemini/
Claude with web access), transcribe the model's findings into inbox candidates.

## Procedure (agent)

1. Input: the sweep output (markdown/table/prose). One inbox candidate per find.
2. Per find, build an `InboxCandidate` (types in `lib/intake/inbox.ts`):
   - `cid`: `candidateCid(name, "llm-sweep")`
   - `name`, `country`, `region`, `claimedDates`, `categoryGuess` (map the model's
     type guess onto: organic / permanent_commercial / permanent_community / popup /
     traveling / spanish_immersion)
   - `providerUrl`: the find's first-party link if given — NEVER an aggregator
     domain (`data/research/aggregator-domains.json`); aggregator links go into
     `evidence` instead
   - `evidence`: every source URL the model cited, each with its as-of date;
     a find with NO source URL gets `evidence: []` and a note saying so
     (low-trust, the review page shows it)
   - `dedupe`: via `dedupeVerdict(name, country, directory entries)` — drop "known"
   - `sourceChannel`: `"llm-sweep"`, `notes`: one-line evidence summary
3. Skip names in `data/research/inbox/rejected.json` and cids already in the inbox.
4. Append to `data/research/inbox/candidates.json`; report counts + a table.
5. Discipline (same as the research prompts): never invent; families ≠ nomads;
   a homepage read is not a source read.
