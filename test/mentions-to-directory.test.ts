import { describe, it, expect } from "vitest";
import { buildNewOrganic, type SeedTown } from "../scripts/mentions-to-directory";
import type { ScoredPlace } from "../lib/intake/mentions";

const SEED: SeedTown = { canonical: "Luxor", country: "Egypt", newName: "Luxor", newId: "luxor", region: "Luxor" };
const PLACE = (over: Partial<ScoredPlace>): ScoredPlace => ({
  placeId: "luxor--eg", canonicalName: "Luxor", country: "Egypt", coords: [25.7, 32.6],
  score: 2.69, tier: "established", independentDomains: 7, matchedExistingHubIds: [], sources: [], ...over,
});

describe("buildNewOrganic", () => {
  it("produces a CSV row, a coord entry, and an id→placeId map entry", () => {
    const r = buildNewOrganic([SEED], [PLACE({})], new Set<string>());
    expect(r.collisions).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      name: "Luxor", type: "organic", country: "Egypt", region_city: "Luxor",
      source_directory: "mention-mining", confidence: "mention-mining", dedup_status: "NEW",
    });
    expect(r.coords["luxor"]).toEqual([25.7, 32.6]);
    expect(r.idToPlaceId["luxor"]).toBe("luxor--eg");
  });
  it("flags an id that collides with an existing directory id", () => {
    const r = buildNewOrganic([SEED], [PLACE({})], new Set(["luxor"]));
    expect(r.collisions).toEqual(["luxor"]);
  });
  it("flags a seed whose place is missing from the scored data", () => {
    const r = buildNewOrganic([{ ...SEED, canonical: "Nowhere" }], [PLACE({})], new Set());
    expect(r.missing).toEqual(["Nowhere"]);
  });
});
