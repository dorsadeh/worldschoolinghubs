import { describe, it, expect } from "vitest";
import {
  normName, slugify, candidateCid, dedupeVerdict, isRejected, candidateToCsvRow,
  loadRejected, saveRejected,
  type InboxCandidate,
} from "../lib/intake/inbox";

const DIR = [
  { id: "harmony-learning-center", name: "Harmony Learning Center", country: "Costa Rica" },
  { id: "bansko-town-base-city", name: "Bansko Town (base city)", country: "Bulgaria" },
];

describe("normName / slugify", () => {
  it("normalizes case and whitespace", () => {
    expect(normName("  Harmony   LEARNING Center ")).toBe("harmony learning center");
  });
  it("slugifies like build_directory.py (lower, non-alnum→-, trim, max 42)", () => {
    expect(slugify("Bansko Town (base city)")).toBe("bansko-town-base-city");
    expect(slugify("A".repeat(60))).toHaveLength(42);
  });
});

describe("candidateCid", () => {
  it("is stable and channel-scoped", () => {
    expect(candidateCid("Portugal Pop Up", "manual")).toBe("portugal-pop-up--manual");
  });
});

describe("dedupeVerdict", () => {
  it("exact normalized name → known", () => {
    expect(dedupeVerdict("harmony learning CENTER", "Costa Rica", DIR)).toBe("known");
  });
  it("slug match → known", () => {
    expect(dedupeVerdict("Bansko Town (Base City)", "Bulgaria", DIR)).toBe("known");
  });
  it("containment + same country → possible-dup-of", () => {
    expect(dedupeVerdict("Harmony Learning", "Costa Rica", DIR))
      .toBe("possible-dup-of:harmony-learning-center");
  });
  it("containment but different country → new", () => {
    expect(dedupeVerdict("Harmony Learning", "Mexico", DIR)).toBe("new");
  });
  it("unrelated name → new", () => {
    expect(dedupeVerdict("Slovakia Summer Hub", "Slovakia", DIR)).toBe("new");
  });
  it("short dir name as substring of a longer candidate word → new (no false dup)", () => {
    const dir = [{ id: "pai", name: "Pai", country: "Thailand" }];
    expect(dedupeVerdict("Paid Workshop", "Thailand", dir)).toBe("new");
  });
  it("token subset (not substring) drives possible-dup", () => {
    const dir = [{ id: "pai", name: "Pai", country: "Thailand" }];
    expect(dedupeVerdict("Pai Worldschool", "Thailand", dir)).toBe("possible-dup-of:pai");
  });
});

describe("isRejected", () => {
  it("matches on normalized name", () => {
    expect(isRejected("  Dead HUB ", { names: ["dead hub"] })).toBe(true);
    expect(isRejected("Live Hub", { names: ["dead hub"] })).toBe(false);
  });
});

describe("candidateToCsvRow", () => {
  const base: InboxCandidate = {
    cid: "x--manual", name: "Portugal Pop Up", country: "Portugal", region: "Cascais",
    claimedDates: "weekly", categoryGuess: "popup",
    providerUrl: "https://www.portugalpopup.com/", urlType: "site",
    evidence: [{ url: "https://www.portugalpopup.com/", asOf: "2026-06-12" }],
    sourceChannel: "manual", notes: "weekly meetups", dedupe: "new", addedAt: "2026-06-12T00:00:00Z",
  };
  it("maps site urls to the website column", () => {
    const row = candidateToCsvRow(base);
    expect(row.website).toBe("https://www.portugalpopup.com/");
    expect(row.facebook_instagram).toBe("");
    expect(row.name).toBe("Portugal Pop Up");
    expect(row.type).toBe("popup");
    expect(row.region_city).toBe("Cascais");
    expect(row.season_dates).toBe("weekly");
    expect(row.source_directory).toBe("manual");
    expect(row.confidence).toBe("inbox");
    expect(row.dedup_status).toBe("NEW");
  });
  it("maps social urls to the facebook_instagram column", () => {
    const row = candidateToCsvRow({ ...base, urlType: "social",
      providerUrl: "https://facebook.com/groups/x" });
    expect(row.website).toBe("");
    expect(row.facebook_instagram).toBe("https://facebook.com/groups/x");
  });
  it("null url → both columns empty", () => {
    const row = candidateToCsvRow({ ...base, providerUrl: null });
    expect(row.website).toBe("");
    expect(row.facebook_instagram).toBe("");
  });
});

describe("candidateCid channel slugging", () => {
  it("slugifies a channel containing the separator/spaces", () => {
    expect(candidateCid("Hub X", "aggregator-diff:worldschooly.com"))
      .toBe("hub-x--aggregator-diff-worldschooly-com");
  });
});

describe("saveRejected normalization (round-trip)", () => {
  it("normalizes names so isRejected matches", () => {
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const { writeFileSync, readFileSync, rmSync } = require("node:fs");
    const p = join(tmpdir(), `rej-${Date.now()}.json`);
    writeFileSync(p, JSON.stringify({ names: ["Dead Hub"] }));
    const r = loadRejected(p);
    saveRejected(r, p);
    const reloaded = JSON.parse(readFileSync(p, "utf8"));
    rmSync(p);
    expect(reloaded.names).toContain("dead hub");
    expect(isRejected("  DEAD hub ", reloaded)).toBe(true);
  });
});
