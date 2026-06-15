# Mention-mining orchestration runbook

The controller (main session) drives extraction in batches. Dispatching agents is not
scriptable; the planner, resolve, score, and review steps ARE scripted.

## Cycle
1. `npm run mentions:seed-registry` — refresh the source registry from the directory
   (only appends new domains; preserves your edits). Review any `status: frontier`
   entries and promote good ones to `active` (set the correct `kind`).
2. `npm run discover:mentions` — writes `worklist.json` (pages needing extraction).
3. **Dispatch extraction agents.** Read `worklist.json`. In batches of ~10 items,
   dispatch the `mention-extractor` agent (Haiku, set by the agent's frontmatter) IN
   PARALLEL — one Agent call per item, all in one message — passing `url` and `kind`.
   Each returns strict JSON `{ sourceUrl, placeMentions[], outboundLinks[] }`.
4. **Write snapshots.** For each agent result, write/replace its page in
   `snapshots/<domain>.json` (shape: `{ domain, extractedAt, pages: [{ url, contentHash,
   placeMentions, outboundLinks }] }`). Use the `contentHash` from the matching
   worklist item (the agent does not compute hashes). Merge by `url` within the domain.
5. `npm run mentions:resolve` — geocodes mentions, dedups into canonical places, updates
   the ledger, links existing directory hubs, and appends new outbound domains to the
   registry as `frontier`.
6. `npm run mentions:score` — writes `organic-places-scored.json`.
7. `npm run mentions:review` — writes `organic-places-review.html`. Open it (file://),
   Approve/Reject, export `organic-places-decisions.json` to ~/Downloads.
8. Commit the cycle (registry + snapshots + places + ledger + scored + html).

## Discipline
- Agents are READ-ONLY and never followed past one page; outbound links are recorded
  as `frontier` and never crawled until you promote them to `active`.
- Geocode is the dedup key — never merge two places by name alone.
- Nothing here edits the directory / overrides.json. Approved decisions are the input to
  a SEPARATE later ingestion step (out of scope for this pipeline).
- Keep batches small so a bad batch is easy to discard (snapshots are per-domain files).
