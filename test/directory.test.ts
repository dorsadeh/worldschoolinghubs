import { describe, it, expect } from "vitest";
import { filterDirectory, isAnywhereHub, isHiddenHub, uniqueDirectoryCountries, hubImage, sortByImagePresence, countActiveFilters, type DirectoryHub } from "../lib/directory";

function hub(overrides: Partial<DirectoryHub> & { id: string }): DirectoryHub {
  return {
    name: overrides.id, host: "", category: "organic",
    spanish: false, participation: "", country: "Spain", region: "",
    season: "", months: [], price: "", costBucket: "unlisted", ages: "",
    nationality: "", validity: "", website: "", facebook: "", summary: "",
    references: [], image: "", coords: null, ...overrides,
  };
}

describe("filterDirectory", () => {
  const hubs = [
    hub({ id: "a", category: "organic", months: [12, 1, 2], costBucket: "low", participation: "family", country: "Bulgaria" }),
    hub({ id: "b", category: "popup", months: [], costBucket: "unlisted", participation: "dropoff", country: "Mexico" }),
    hub({ id: "c", category: "spanish_immersion", months: [6, 7], costBucket: "high", spanish: true, country: "Spain", summary: "Sucre immersion" }),
  ];

  it("returns all hubs with no filter", () => {
    expect(filterDirectory(hubs, {}).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });
  it("month filter keeps matches AND flexible ([]) hubs", () => {
    expect(filterDirectory(hubs, { months: [1] }).map((h) => h.id)).toEqual(["a", "b"]);
  });
  it("cost filter hides unlisted once specific buckets are chosen", () => {
    expect(filterDirectory(hubs, { costs: ["low", "high"] }).map((h) => h.id)).toEqual(["a", "c"]);
  });
  it("category filter is OR within the facet", () => {
    expect(filterDirectory(hubs, { categories: ["organic", "popup"] }).map((h) => h.id)).toEqual(["a", "b"]);
  });
  it("matches a hub on any of its categories when it spans more than one", () => {
    const multi = [hub({ id: "m", category: "popup", categories: ["popup", "permanent_commercial"] })];
    expect(filterDirectory(multi, { categories: ["permanent_commercial"] }).map((h) => h.id)).toEqual(["m"]);
    expect(filterDirectory(multi, { categories: ["popup"] }).map((h) => h.id)).toEqual(["m"]);
    expect(filterDirectory(multi, { categories: ["organic"] }).map((h) => h.id)).toEqual([]);
  });
  it("monthRange matches within a normal range and keeps flexible hubs", () => {
    // a: Dec/Jan/Feb, b: flexible ([]), c: Jun/Jul
    expect(filterDirectory(hubs, { monthRange: [6, 8] }).map((h) => h.id)).toEqual(["b", "c"]);
  });
  it("monthRange wraps the year-end when from > to", () => {
    // Nov–Mar should catch a (Dec/Jan/Feb) and flexible b, but not c (Jun/Jul)
    expect(filterDirectory(hubs, { monthRange: [11, 3] }).map((h) => h.id)).toEqual(["a", "b"]);
  });
  it("participation filter hides blank-participation entries", () => {
    expect(filterDirectory(hubs, { participation: ["family"] }).map((h) => h.id)).toEqual(["a"]);
  });
  it("spanishOnly keeps only spanish hubs", () => {
    expect(filterDirectory(hubs, { spanishOnly: true }).map((h) => h.id)).toEqual(["c"]);
  });
  it("query matches summary and country case-insensitively", () => {
    expect(filterDirectory(hubs, { query: "sucre" }).map((h) => h.id)).toEqual(["c"]);
    expect(filterDirectory(hubs, { query: "mexico" }).map((h) => h.id)).toEqual(["b"]);
  });
  it("combines facets with AND", () => {
    expect(filterDirectory(hubs, { months: [7], spanishOnly: true }).map((h) => h.id)).toEqual(["c"]);
  });
});

describe("isAnywhereHub", () => {
  it("is true for coordless hubs", () => {
    expect(isAnywhereHub(hub({ id: "a", category: "popup", coords: null }))).toBe(true);
  });
  it("is false for any hub that carries coordinates", () => {
    expect(isAnywhereHub(hub({ id: "a", category: "organic", coords: [40, -3] }))).toBe(false);
    expect(isAnywhereHub(hub({ id: "b", category: "traveling", coords: [10, 10] }))).toBe(false);
  });
});

describe("isHiddenHub", () => {
  it("hides junk and online_communities hubs", () => {
    expect(isHiddenHub(hub({ id: "a", category: "junk" }))).toBe(true);
    expect(isHiddenHub(hub({ id: "b", category: "online_communities" }))).toBe(true);
  });
  it("shows normal place-based categories", () => {
    expect(isHiddenHub(hub({ id: "a", category: "organic" }))).toBe(false);
    expect(isHiddenHub(hub({ id: "b", category: "popup" }))).toBe(false);
  });
});

describe("uniqueDirectoryCountries", () => {
  it("returns sorted unique non-empty countries", () => {
    const hubs = [hub({ id: "a", country: "Mexico" }), hub({ id: "b", country: "" }), hub({ id: "c", country: "Bulgaria" })];
    expect(uniqueDirectoryCountries(hubs)).toEqual(["Bulgaria", "Mexico"]);
  });
});

describe("hubImage", () => {
  it("returns the image path when present and not blocklisted", () => {
    expect(hubImage(hub({ id: "a", image: "/directory-images/a.jpg" }), new Set())).toBe("/directory-images/a.jpg");
  });
  it("returns null for an empty image path", () => {
    expect(hubImage(hub({ id: "a", image: "" }), new Set())).toBeNull();
  });
  it("returns null for blocklisted hubs", () => {
    expect(hubImage(hub({ id: "a", image: "/directory-images/a.jpg" }), new Set(["a"]))).toBeNull();
  });
});

describe("sortByImagePresence", () => {
  it("puts hubs with usable images first, preserving relative order within each group", () => {
    const list = [
      hub({ id: "no1", image: "" }),
      hub({ id: "img1", image: "/x.jpg" }),
      hub({ id: "no2", image: "" }),
      hub({ id: "img2", image: "/y.jpg" }),
    ];
    expect(sortByImagePresence(list, new Set()).map((h) => h.id)).toEqual(["img1", "img2", "no1", "no2"]);
  });
  it("treats blocklisted images as missing", () => {
    const list = [hub({ id: "junk", image: "/x.jpg" }), hub({ id: "good", image: "/y.jpg" })];
    expect(sortByImagePresence(list, new Set(["junk"])).map((h) => h.id)).toEqual(["good", "junk"]);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for an empty filter", () => {
    expect(countActiveFilters({})).toBe(0);
  });
  it("counts the month range as one plus each selected value", () => {
    expect(countActiveFilters({ monthRange: [11, 3], costs: ["free", "low"], categories: ["popup"], participation: ["family"] })).toBe(5);
  });
  it("ignores the text query", () => {
    expect(countActiveFilters({ query: "goa" })).toBe(0);
  });
});
