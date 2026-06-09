import { describe, it, expect } from "vitest";
import { costBucket } from "../lib/cost";

describe("costBucket", () => {
  it("returns unlisted for blank or vague price", () => {
    expect(costBucket("")).toBe("unlisted");
    expect(costBucket("Varies")).toBe("unlisted");
  });
  it("detects free", () => {
    expect(costBucket("Free")).toBe("free");
    expect(costBucket("Free (WhatsApp self-organized)")).toBe("free");
  });
  it("detects qualitative low", () => {
    expect(costBucket("Low cost of living")).toBe("low");
  });
  it("buckets monthly amounts", () => {
    expect(costBucket("$720 USD per month")).toBe("low");
    expect(costBucket("~$1,088/mo")).toBe("mid");
  });
  it("buckets large lump sums as high", () => {
    expect(costBucket("Starting at €3,500 (14 nights lodging, group activities)")).toBe("high");
  });
  it("buckets a small per-family fee as low", () => {
    expect(costBucket("Max $180/family, discounts available")).toBe("low");
  });
});
