// test/intake-mentions.test.ts
import { describe, it, expect } from "vitest";
import { placeId } from "../lib/intake/mentions";

describe("placeId", () => {
  it("slugifies name and lowercases the country code", () => {
    expect(placeId("Pai", "TH")).toBe("pai--th");
    expect(placeId("Chiang Mai", "th")).toBe("chiang-mai--th");
  });
});

import {
  kindWeight, recencyFactor, claimFactor, scorePlace,
  independentDomainCount, tierOf, type LedgerMention,
} from "../lib/intake/mentions";

const NOW = "2026-06-15";
function m(over: Partial<LedgerMention>): LedgerMention {
  return { placeId: "pai--th", domain: "blog.example", kind: "personal-blog",
    url: "https://x", snippet: "", nestingClaim: true, date: "2026-01", addedAt: NOW, ...over };
}

describe("kindWeight", () => {
  it("uses kind defaults", () => {
    expect(kindWeight("personal-blog")).toBe(1.0);
    expect(kindWeight("hub-site")).toBe(0.2);
  });
  it("honors a per-source override", () => {
    expect(kindWeight("directory", 0.9)).toBe(0.9);
  });
});

describe("recencyFactor", () => {
  it("full weight within 18 months", () => {
    expect(recencyFactor("2025-06", NOW)).toBe(1.0);
  });
  it("decays past 18 months and past 5 years", () => {
    expect(recencyFactor("2023-06", NOW)).toBe(0.5);
    expect(recencyFactor("2018-01", NOW)).toBe(0.3);
  });
  it("mild penalty for unknown dates", () => {
    expect(recencyFactor("unknown", NOW)).toBe(0.6);
  });
});

describe("claimFactor", () => {
  it("discounts non-nesting travel mentions", () => {
    expect(claimFactor(true)).toBe(1.0);
    expect(claimFactor(false)).toBe(0.4);
  });
});

describe("scorePlace", () => {
  it("sums kind*recency*claim over DISTINCT domains", () => {
    const score = scorePlace([
      m({ domain: "a.blog", kind: "personal-blog", date: "2026-01", nestingClaim: true }),  // 1.0*1.0*1.0
      m({ domain: "b.press", kind: "press", date: "2026-01", nestingClaim: true }),          // 0.9*1.0*1.0
    ], {}, NOW);
    expect(score).toBe(1.9);
  });
  it("counts a repeated domain only once", () => {
    const score = scorePlace([
      m({ domain: "a.blog", kind: "personal-blog" }),
      m({ domain: "a.blog", kind: "personal-blog" }),
    ], {}, NOW);
    expect(score).toBe(1.0);
  });
});

describe("independentDomainCount / tierOf", () => {
  it("excludes hub-site domains from the independent count", () => {
    const n = independentDomainCount([
      m({ domain: "a.blog", kind: "personal-blog" }),
      m({ domain: "b.press", kind: "press" }),
      m({ domain: "own.site", kind: "hub-site" }),
    ]);
    expect(n).toBe(2);
  });
  it("tiers by independent-domain count", () => {
    expect(tierOf(6)).toBe("established");
    expect(tierOf(3)).toBe("emerging");
    expect(tierOf(2)).toBe("watch");
  });
});

import { ledgerUpsert, upsertPlace, type Place } from "../lib/intake/mentions";

function place(over: Partial<Place>): Place {
  return { placeId: "pai--th", canonicalName: "Pai", country: "Thailand", cc: "th",
    coords: [19.36, 98.44], aliases: ["Pai"], existingHubIds: [], firstSeen: NOW, ...over };
}

describe("ledgerUpsert", () => {
  it("adds a new (placeId,domain) row", () => {
    const out = ledgerUpsert([], m({ domain: "a.blog" }));
    expect(out).toHaveLength(1);
  });
  it("is idempotent for the same (placeId,domain) — one vote", () => {
    let l: LedgerMention[] = [];
    l = ledgerUpsert(l, m({ domain: "a.blog", snippet: "first" }));
    l = ledgerUpsert(l, m({ domain: "a.blog", snippet: "second" }));
    expect(l).toHaveLength(1);
    expect(l[0].snippet).toBe("second"); // updates in place
  });
});

describe("upsertPlace", () => {
  it("merges aliases and existingHubIds, preserves firstSeen, fills null coords", () => {
    let ps = upsertPlace([], place({ aliases: ["Pai"], firstSeen: "2026-01-01" }));
    ps = upsertPlace(ps, place({ aliases: ["Pai Thailand"], existingHubIds: ["pai"], firstSeen: "2026-06-15" }));
    expect(ps).toHaveLength(1);
    expect(ps[0].aliases).toEqual(["Pai", "Pai Thailand"]);
    expect(ps[0].existingHubIds).toEqual(["pai"]);
    expect(ps[0].firstSeen).toBe("2026-01-01");
  });
});

import {
  haversineKm, findPlaceByCoords, matchExistingHub,
  domainOf, nextFrontierDomains, type SourceRegistry,
} from "../lib/intake/mentions";

describe("haversineKm", () => {
  it("≈0 for identical points and ~hundreds of km apart", () => {
    expect(haversineKm([19.36, 98.44], [19.36, 98.44])).toBeCloseTo(0, 3);
    expect(haversineKm([19.36, 98.44], [13.75, 100.50])).toBeGreaterThan(600); // Pai→Bangkok
  });
});

describe("findPlaceByCoords", () => {
  const places = [place({ placeId: "pai--th", coords: [19.36, 98.44], cc: "th" })];
  it("matches a nearby same-country place (cluster radius)", () => {
    expect(findPlaceByCoords(places, [19.37, 98.45], "th", 10)?.placeId).toBe("pai--th");
  });
  it("does not match a far point", () => {
    expect(findPlaceByCoords(places, [13.75, 100.50], "th", 10)).toBeNull();
  });
  it("does not match across country codes", () => {
    expect(findPlaceByCoords(places, [19.36, 98.44], "la", 10)).toBeNull();
  });
});

describe("matchExistingHub", () => {
  const hubs = [
    { id: "pai", coords: [19.36, 98.44] as [number, number], country: "Thailand" },
    { id: "bansko", coords: [41.83, 23.48] as [number, number], country: "Bulgaria" },
  ];
  it("links hubs within 25km of the same country", () => {
    expect(matchExistingHub([19.40, 98.40], "Thailand", hubs, 25)).toEqual(["pai"]);
  });
  it("returns [] for null coords", () => {
    expect(matchExistingHub(null, "Thailand", hubs, 25)).toEqual([]);
  });
});

describe("domainOf / nextFrontierDomains", () => {
  it("strips www and lowercases", () => {
    expect(domainOf("https://www.Example.com/x")).toBe("example.com");
    expect(domainOf("not a url")).toBeNull();
  });
  it("returns only unknown outbound domains", () => {
    const reg: SourceRegistry = { updatedAt: NOW, sources: [
      { domain: "known.com", name: "K", kind: "directory", lang: "en", weight: null,
        status: "active", seedUrls: [], addedAt: NOW, notes: "" },
    ] };
    const out = nextFrontierDomains(
      [{ url: "https://known.com/a", anchor: "" }, { url: "https://new.blog/b", anchor: "" }],
      reg,
    );
    expect(out).toEqual(["new.blog"]);
  });
});
