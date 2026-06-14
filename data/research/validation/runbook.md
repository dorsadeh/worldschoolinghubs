# Hub-validation orchestration runbook

The controller (main session) runs validation in batches. This is controller
procedure — dispatching agents is not scriptable. The apply + image steps ARE
scripted (`npm run validation:apply`, the image fetchers).

## Inputs
- Targets: hubs to validate. Default order: the unvalidated subset first
  (entries whose `validity` contains "inbox-approved" in
  `data/research/directory-consolidated-2026-06-09.json`, plus any current inbox
  candidates), then the rest of the 296.
- Existing operator names (for dedup-escalation): the `name` of every directory entry.

## Per batch (~10 hubs)
1. Build each hub's input from the directory JSON (id, name, country, region,
   category, website).
2. For each hub, decide the model with `needsSonnet(hub, existingOperatorNames)`
   (lib/intake/validation.ts): no link / inactive / dup-candidate ⇒ Sonnet now;
   otherwise dispatch Haiku.
3. Dispatch the `hub-validator` agent per hub IN PARALLEL (one Agent call each,
   all in one message). Each returns the strict-JSON verdict.
4. ESCALATE: for any Haiku verdict with confidence ≠ "high", re-dispatch that hub
   on Sonnet; the Sonnet verdict replaces it. Tag each kept verdict with `model`.
5. Append the batch's verdicts to `data/research/validation/results.json`
   (dedupe by id — a re-validation overwrites the prior verdict).

## After batches
6. `npm run validation:apply` — auto-applies high-confidence verdicts to
   overrides.json, writes the flags report for the rest.
7. Image stage: `cd data/research && python3 fetch_images.py && python3
   fetch_location_images.py && cd ..` (own photo + free location photo on the
   corrected links).
8. Rebuild: `cd data/research && ./make.sh --no-fetch && cd .. && npm run build:explorer`.
9. Commit the batch (results.json + overrides.json + regenerated artifacts + images).
10. Review `docs/validation-flags-<date>.md` for the flagged minority.

## Discipline
- Never auto-apply medium/low confidence — those are flags only.
- An aggregator URL is never written as a link (validationToOverride strips it).
- Each batch commits independently so a bad batch is revertible.
