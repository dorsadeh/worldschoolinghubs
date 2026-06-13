import { describe, it, expect } from "vitest";
import { extractSlugs, slugToName, diffListings, extractListingDate, extractTitle } from "../lib/intake/scrape";

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
  it("accepts a named capture group", () => {
    expect(extractSlugs('<a href="https://x.com/hub/abc/">y</a>', "https://x\\.com/hub/(?<slug>[a-z]+)/"))
      .toEqual({ abc: "https://x.com/hub/abc/" });
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

describe("extractListingDate", () => {
  it("reads an ISO datetime attribute (newest wins)", () => {
    expect(extractListingDate('<time datetime="2023-10-02">x</time><time datetime="2023-10-23">y</time>'))
      .toBe("2023-10-23");
  });
  it("falls back to 'Month DD, YYYY' text (newest wins)", () => {
    expect(extractListingDate("Posted September 16, 2024 — updated March 26, 2024"))
      .toBe("2024-09-16");
  });
  it("returns null when no date is present", () => {
    expect(extractListingDate("no dates here")).toBeNull();
  });
});

describe("extractTitle", () => {
  it("prefers og:title", () => {
    expect(extractTitle('<meta property="og:title" content="Dhangethi Maldives Hub" /><title>x | Atlas</title>'))
      .toBe("Dhangethi Maldives Hub");
  });
  it("falls back to <h1>", () => {
    expect(extractTitle("<h1>  Valencia Worldschool Hub </h1>")).toBe("Valencia Worldschool Hub");
  });
  it("returns null when neither present", () => {
    expect(extractTitle("<p>nope</p>")).toBeNull();
  });
});
