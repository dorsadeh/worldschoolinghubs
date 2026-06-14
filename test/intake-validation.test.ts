import { describe, it, expect } from "vitest";
import {
  needsSonnet, validationToOverride, partitionResults,
  type ValidationResult, type HubForValidation,
} from "../lib/intake/validation";

const REG = { "worldschooly.com": { note: "" }, "wanderworks.life": { note: "" } };

const hub = (o: Partial<HubForValidation>): HubForValidation =>
  ({ id: "x", name: "X", country: "Y", category: "permanent_commercial", website: "https://x.com", ...o });

describe("needsSonnet (escalation triggers)", () => {
  it("escalates when the hub has no link", () => {
    expect(needsSonnet(hub({ website: "" }), [])).toBe(true);
  });
  it("escalates when the hub is currently inactive (recheck)", () => {
    expect(needsSonnet(hub({ category: "inactive" }), [])).toBe(true);
  });
  it("escalates when the name overlaps an existing operator (dup-candidate)", () => {
    expect(needsSonnet(hub({ name: "Bliss Hub Siem Reap" }), ["Bliss Hubs Pai"])).toBe(true);
  });
  it("escalates when a prior haiku result was not high-confidence", () => {
    expect(needsSonnet(hub({}), [], { confidence: "low" } as ValidationResult)).toBe(true);
    expect(needsSonnet(hub({}), [], { confidence: "medium" } as ValidationResult)).toBe(true);
  });
  it("does NOT escalate a clear hub with a link and a high-confidence haiku verdict", () => {
    expect(needsSonnet(hub({}), ["Unrelated Place"], { confidence: "high" } as ValidationResult)).toBe(false);
  });
});

const res = (o: Partial<ValidationResult>): ValidationResult =>
  ({ id: "h", status: "active", confidence: "high", fields: {}, disposition: "keep", ...o });

describe("validationToOverride (high-confidence only)", () => {
  it("keep → null (no-op)", () => {
    expect(validationToOverride(res({ disposition: "keep" }), REG)).toBeNull();
  });
  it("fix → website + websiteType + category from fields", () => {
    expect(validationToOverride(res({ disposition: "fix",
      fields: { website: "https://whalecamp.com/", websiteType: "site", category: "summer_camp" } }), REG))
      .toEqual({ website: "https://whalecamp.com/", websiteType: "site", category: "summer_camp" });
  });
  it("fix strips an aggregator website (never link to one)", () => {
    expect(validationToOverride(res({ disposition: "fix",
      fields: { website: "https://wanderworks.life/camp/x", websiteType: "site" } }), REG))
      .toBeNull();
  });
  it("junk → hidden junk category", () => {
    expect(validationToOverride(res({ disposition: "junk" }), REG)).toEqual({ category: "junk" });
  });
  it("inactive → hidden inactive category", () => {
    expect(validationToOverride(res({ disposition: "inactive" }), REG)).toEqual({ category: "inactive" });
  });
  it("merge → hide the duplicate via junk", () => {
    expect(validationToOverride(res({ disposition: "merge", dupOf: "bliss-hubs-siem-reap" }), REG))
      .toEqual({ category: "junk" });
  });
  it("medium/low confidence → null (flagged, never auto-applied)", () => {
    expect(validationToOverride(res({ confidence: "low", disposition: "junk" }), REG)).toBeNull();
    expect(validationToOverride(res({ confidence: "medium", disposition: "fix",
      fields: { website: "https://x.com" } }), REG)).toBeNull();
  });
});

describe("partitionResults", () => {
  it("splits into auto-apply vs flag", () => {
    const results = [
      res({ id: "a", confidence: "high", disposition: "fix", fields: { website: "https://a.com" } }),
      res({ id: "b", confidence: "high", disposition: "keep" }),         // no-op → neither
      res({ id: "c", confidence: "low", disposition: "junk" }),          // flag
      res({ id: "d", confidence: "high", disposition: "junk" }),         // apply
      res({ id: "e", confidence: "medium", disposition: "fix", fields: { website: "https://e.com" } }), // flag
    ];
    const { apply, flag } = partitionResults(results, REG);
    expect(apply.map((r) => r.id).sort()).toEqual(["a", "d"]);
    expect(flag.map((r) => r.id).sort()).toEqual(["c", "e"]);
  });

  it("flags a high-confidence fix whose only website was an aggregator (no silent drop)", () => {
    const results = [
      res({ id: "agg", confidence: "high", disposition: "fix",
        fields: { website: "https://worldschooly.com/hub/x" } }),
    ];
    const { apply, flag } = partitionResults(results, REG);
    expect(apply).toEqual([]);
    expect(flag.map((r) => r.id)).toEqual(["agg"]);
  });
});
