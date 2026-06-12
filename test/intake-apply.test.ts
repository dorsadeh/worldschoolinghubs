import { describe, it, expect } from "vitest";
import { applyDecisions } from "../lib/intake/apply";

const records = [
  { id: "harmony-learning-center", verdict: "aggregator-link",
    proposedUrl: "https://harmonylc.org", proposedUrlType: "site" as const },
  { id: "dead-hub", verdict: "dead", proposedUrl: null, proposedCategory: "junk" as const },
  { id: "fine-hub", verdict: "ok-provider" },
];

describe("applyDecisions", () => {
  it("approve with no fields takes the record's proposed values", () => {
    const out = applyDecisions(records, {
      "harmony-learning-center": { decision: "approve" },
    }, {});
    expect(out["harmony-learning-center"]).toEqual({
      website: "https://harmonylc.org", websiteType: "site",
    });
  });
  it("approve applies proposedCategory (junk path)", () => {
    const out = applyDecisions(records, { "dead-hub": { decision: "approve" } }, {});
    expect(out["dead-hub"]).toEqual({ category: "junk" });
  });
  it("explicit fields in the decision win over proposed", () => {
    const out = applyDecisions(records, {
      "harmony-learning-center":
        { decision: "approve", website: "https://facebook.com/harmonylc", websiteType: "social" },
    }, {});
    expect(out["harmony-learning-center"]).toEqual({
      website: "https://facebook.com/harmonylc", websiteType: "social",
    });
  });
  it("reject contributes nothing; existing overrides are preserved", () => {
    const existing = { "old-id": { website: "https://kept.example" } };
    const out = applyDecisions(records, { "dead-hub": { decision: "reject" } }, existing);
    expect(out).toEqual(existing);
  });
  it("approve with nothing to apply yields no entry (and is reported by the script)", () => {
    const out = applyDecisions(records, { "fine-hub": { decision: "approve" } }, {});
    expect(out["fine-hub"]).toBeUndefined();
  });
});
