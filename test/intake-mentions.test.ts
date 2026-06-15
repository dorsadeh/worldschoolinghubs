// test/intake-mentions.test.ts
import { describe, it, expect } from "vitest";
import { placeId } from "../lib/intake/mentions";

describe("placeId", () => {
  it("slugifies name and lowercases the country code", () => {
    expect(placeId("Pai", "TH")).toBe("pai--th");
    expect(placeId("Chiang Mai", "th")).toBe("chiang-mai--th");
  });
});
