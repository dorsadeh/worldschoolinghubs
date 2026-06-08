import { describe, it, expect } from "vitest";
import { HubSchema, filterHubs, uniqueCountries, hasCoordinates, type Hub } from "../lib/hub";
import { normalizeName, haversineKm, findDuplicateWarnings } from "../lib/dedup";

function makeHub(overrides: Partial<Hub> & { id: string; name: string }): Hub {
  return HubSchema.parse({
    type: "permanent",
    location: {},
    sources: [{ name: "test", retrieved: "2026-06-08" }],
    ...overrides,
  });
}

describe("HubSchema", () => {
  it("applies defaults for omitted optional fields", () => {
    const hub = makeHub({ id: "a", name: "A" });
    expect(hub.aliases).toEqual([]);
    expect(hub.status).toBe("unknown");
    expect(hub.location.online).toBe(false);
    expect(hub.location.lat).toBeNull();
    expect(hub.verified).toBe(false);
  });

  it("rejects a non-slug id", () => {
    expect(HubSchema.safeParse({ id: "Not A Slug", name: "x", type: "permanent", location: {}, sources: [{ name: "s", retrieved: "2026-06-08" }] }).success).toBe(false);
  });

  it("requires at least one source", () => {
    expect(HubSchema.safeParse({ id: "a", name: "A", type: "permanent", location: {}, sources: [] }).success).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(HubSchema.safeParse({ id: "a", name: "A", type: "permanent", location: { lat: 200, lng: 0 }, sources: [{ name: "s", retrieved: "x" }] }).success).toBe(false);
  });
});

describe("hasCoordinates", () => {
  it("is false for online-only and missing coords", () => {
    expect(hasCoordinates(makeHub({ id: "o", name: "O", type: "online_community", location: { online: true } }))).toBe(false);
    expect(hasCoordinates(makeHub({ id: "n", name: "N" }))).toBe(false);
    expect(hasCoordinates(makeHub({ id: "y", name: "Y", location: { lat: 1, lng: 2 } }))).toBe(true);
  });
});

describe("filterHubs", () => {
  const hubs = [
    makeHub({ id: "a", name: "Algarve Hub", type: "permanent", location: { country: "Portugal", city: "Lagos" } }),
    makeHub({ id: "b", name: "Bali Pop-up", type: "recurring_event", location: { country: "Indonesia" }, status: "inactive" }),
    makeHub({ id: "c", name: "Online Teens", type: "online_community", location: { online: true } }),
  ];

  it("filters by type", () => {
    expect(filterHubs(hubs, { types: ["permanent"] }).map((h) => h.id)).toEqual(["a"]);
  });
  it("filters by country", () => {
    expect(filterHubs(hubs, { countries: ["Indonesia"] }).map((h) => h.id)).toEqual(["b"]);
  });
  it("hides inactive when activeOnly", () => {
    expect(filterHubs(hubs, { activeOnly: true }).map((h) => h.id)).toEqual(["a", "c"]);
  });
  it("searches name and location text", () => {
    expect(filterHubs(hubs, { query: "lagos" }).map((h) => h.id)).toEqual(["a"]);
  });
  it("returns all with empty filter", () => {
    expect(filterHubs(hubs, {})).toHaveLength(3);
  });
});

describe("uniqueCountries", () => {
  it("returns sorted unique countries", () => {
    const hubs = [
      makeHub({ id: "a", name: "A", location: { country: "Portugal" } }),
      makeHub({ id: "b", name: "B", location: { country: "Indonesia" } }),
      makeHub({ id: "c", name: "C", location: { country: "Portugal" } }),
    ];
    expect(uniqueCountries(hubs)).toEqual(["Indonesia", "Portugal"]);
  });
});

describe("dedup", () => {
  it("normalizes away common worldschooling words", () => {
    expect(normalizeName("Worldschool Antigua Guatemala")).toBe(normalizeName("Antigua Guatemala Worldschooling Hub"));
  });
  it("computes plausible distances", () => {
    expect(haversineKm(0, 0, 0, 0)).toBeCloseTo(0);
    expect(haversineKm(40.0, -3.7, 41.4, 2.2)).toBeGreaterThan(400); // Madrid -> Barcelona
  });
  it("flags hubs with similar names", () => {
    const hubs = [
      makeHub({ id: "x1", name: "Worldschool Antigua Guatemala" }),
      makeHub({ id: "x2", name: "Antigua Guatemala Global Explorers" }),
    ];
    const warnings = findDuplicateWarnings(hubs);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
