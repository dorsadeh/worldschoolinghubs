// scripts/mentions-score.ts
/**
 * Score canonical places by weighted independent mentions and write
 * organic-places-scored.json (sorted by score desc).
 *
 * Usage: npm run mentions:score
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  scorePlace, independentDomainCount, tierOf,
  type PlacesFile, type LedgerFile, type SourceRegistry, type ScoredFile, type ScoredPlace,
} from "../lib/intake/mentions";

const MENT = join(process.cwd(), "data", "research", "mentions");
const PLACES = join(MENT, "places.json");
const LEDGER = join(MENT, "mention-ledger.json");
const REGISTRY = join(MENT, "source-registry.json");
const OUT = join(MENT, "organic-places-scored.json");

function main() {
  if (!existsSync(PLACES) || !existsSync(LEDGER)) {
    console.error("Run mentions:resolve first (places.json / mention-ledger.json missing).");
    process.exit(1);
  }
  const places = (JSON.parse(readFileSync(PLACES, "utf8")) as PlacesFile).places;
  const ledger = (JSON.parse(readFileSync(LEDGER, "utf8")) as LedgerFile).mentions;
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as SourceRegistry;
  const weightByDomain = Object.fromEntries(registry.sources.map((s) => [s.domain, s.weight]));

  const byPlace = new Map<string, typeof ledger>();
  for (const m of ledger) (byPlace.get(m.placeId) ?? byPlace.set(m.placeId, []).get(m.placeId)!).push(m);

  const scored: ScoredPlace[] = places.map((p) => {
    const ms = byPlace.get(p.placeId) ?? [];
    const independentDomains = independentDomainCount(ms);
    return {
      placeId: p.placeId, canonicalName: p.canonicalName, country: p.country, coords: p.coords,
      score: scorePlace(ms, weightByDomain),
      tier: tierOf(independentDomains),
      independentDomains,
      matchedExistingHubIds: p.existingHubIds,
      sources: [...new Map(ms.map((m) => [m.domain, m])).values()]
        .map((m) => ({ domain: m.domain, kind: m.kind, url: m.url, snippet: m.snippet, date: m.date })),
    };
  }).sort((a, b) => b.score - a.score || b.independentDomains - a.independentDomains);

  const out: ScoredFile = { computedAt: new Date().toISOString(), places: scored };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  const surf = scored.filter((s) => s.tier !== "watch").length;
  console.log(`scored ${scored.length} places → ${OUT} (${surf} above the ≥3-independent-domain threshold).`);
}

main();
