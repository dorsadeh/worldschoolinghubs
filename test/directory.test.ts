import { describe, it, expect } from "vitest";
import { filterDirectory, uniqueDirectoryCountries, type DirectoryHub } from "../lib/directory";

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

describe("uniqueDirectoryCountries", () => {
  it("returns sorted unique non-empty countries", () => {
    const hubs = [hub({ id: "a", country: "Mexico" }), hub({ id: "b", country: "" }), hub({ id: "c", country: "Bulgaria" })];
    expect(uniqueDirectoryCountries(hubs)).toEqual(["Bulgaria", "Mexico"]);
  });
});
