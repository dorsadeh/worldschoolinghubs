import { describe, it, expect } from "vitest";
import { extractSlugs, slugToName, diffListings } from "../lib/intake/scrape";

const HTML = `
<a href="https://worldschooly.com/hub/harmony-learning-center/">x</a>
<a href="https://worldschooly.com/hub/new-slovakia-hub/" class="c">y</a>
<a href="https://worldschooly.com/hub/harmony-learning-center/">dup</a>
<a href="https://worldschooly.com/hubs/page/2/">next</a>
`;
const PATTERN = "https://worldschooly\\.com/hub/([a-z0-9-]+)/";

describe("extractSlugs", () => {
  it("extracts unique slugs with their urls", () => {
    expect(extractSlugs(HTML, PATTERN)).toEqual({
      "harmony-learning-center": "https://worldschooly.com/hub/harmony-learning-center/",
      "new-slovakia-hub": "https://worldschooly.com/hub/new-slovakia-hub/",
    });
  });
  it("throws when linkPattern has no capture group", () => {
    expect(() => extractSlugs("<a href=x>", "https://x\\.com/no-group/")).toThrow();
  });
});

describe("slugToName", () => {
  it("humanizes slugs", () => {
    expect(slugToName("new-slovakia-hub")).toBe("New Slovakia Hub");
  });
});

describe("diffListings", () => {
  it("returns only slugs absent from the previous snapshot", () => {
    const current = { a: "u1", b: "u2", c: "u3" };
    const prev = { a: "u1" };
    expect(diffListings(current, prev)).toEqual({ b: "u2", c: "u3" });
  });
  it("everything is new when no snapshot exists", () => {
    expect(diffListings({ a: "u1" }, null)).toEqual({ a: "u1" });
  });
});
