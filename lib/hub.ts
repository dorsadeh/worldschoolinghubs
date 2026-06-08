import { z } from "zod";

/**
 * The Hub schema is the single source of truth for a worldschooling hub record.
 * It is used three ways:
 *   1. Runtime validation of every JSON file in data/hubs/ (scripts/validate.ts)
 *   2. The TypeScript `Hub` type (via z.infer) used across the app
 *   3. Documentation of what a curated record looks like
 *
 * The web sources are messy, so most "factual" fields are free-text on purpose
 * (price, length, dates). Provenance (`sources`) and `verified` let us track how
 * trustworthy each record is.
 */

export const HUB_TYPES = [
  "permanent", // year-round hub / school / coliving families orbit
  "recurring_event", // pop-ups, summits, camps, retreats with dates
  "base_city", // a city/region that's a good worldschooling base
  "online_community", // primarily online group, no fixed location
] as const;

export const HUB_STATUSES = [
  "active",
  "seasonal",
  "upcoming",
  "inactive",
  "unknown",
] as const;

export const HUB_AUDIENCES = ["children", "families", "adults", "mixed"] as const;

const SourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  retrieved: z.string().min(1), // ISO date the data was captured
});

const SessionSchema = z.object({
  start: z.string().optional(), // ISO date when known
  end: z.string().optional(),
  label: z.string().optional(),
});

export const HubSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "id must be a kebab-case slug"),
  name: z.string().min(1),
  host: z.string().optional(), // "Host of the Hub" column
  aliases: z.array(z.string()).default([]), // other names seen across sources

  type: z.enum(HUB_TYPES),
  status: z.enum(HUB_STATUSES).default("unknown"),
  audience: z.enum(HUB_AUDIENCES).default("families"),

  location: z.object({
    country: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().default(null),
    lng: z.number().min(-180).max(180).nullable().default(null),
    online: z.boolean().default(false),
    note: z.string().optional(), // e.g. "various locations", "40km south of Valencia"
  }),

  schedule: z
    .object({
      recurring: z.string().optional(), // free season label e.g. "spring", "year round"
      sessions: z.array(SessionSchema).default([]),
      note: z.string().optional(), // raw, messy dates text from the source
    })
    .default({ sessions: [] }),

  ages: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      note: z.string().optional(),
    })
    .default({}),

  price: z.string().optional(), // free-text, sources are wildly inconsistent
  length: z.string().optional(), // e.g. "3 weeks", "year round"
  educational: z.string().optional(), // "Educational component" column
  description: z.string().optional(),
  safety: z.string().optional(),
  reviews: z.string().optional(), // "We can families find reviews?" column

  links: z
    .object({
      website: z.string().optional(),
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      registration: z.string().optional(),
    })
    .default({}),

  sources: z.array(SourceSchema).min(1, "every hub needs at least one source"),
  verified: z.boolean().default(false),
  lastVerified: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
});

export type Hub = z.infer<typeof HubSchema>;
export type HubType = (typeof HUB_TYPES)[number];
export type HubStatus = (typeof HUB_STATUSES)[number];

/** Marker colour + label per hub type, used by the map legend and list. */
export const TYPE_META: Record<HubType, { label: string; color: string }> = {
  permanent: { label: "Permanent hub", color: "#2563eb" }, // blue
  recurring_event: { label: "Pop-up / event", color: "#db2777" }, // pink
  base_city: { label: "Base city", color: "#16a34a" }, // green
  online_community: { label: "Online community", color: "#9333ea" }, // purple
};

export interface HubFilter {
  types?: HubType[];
  countries?: string[];
  query?: string;
  activeOnly?: boolean; // hide inactive
}

/** A hub renders as a map marker only if it has real coordinates and isn't online-only. */
export function hasCoordinates(hub: Hub): boolean {
  return (
    !hub.location.online &&
    typeof hub.location.lat === "number" &&
    typeof hub.location.lng === "number"
  );
}

const SEARCH_FIELDS = (hub: Hub): string =>
  [
    hub.name,
    hub.host,
    hub.location.country,
    hub.location.region,
    hub.location.city,
    ...hub.aliases,
    ...hub.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** Pure, testable filtering used by the explorer UI. */
export function filterHubs(hubs: Hub[], filter: HubFilter): Hub[] {
  const q = filter.query?.trim().toLowerCase();
  return hubs.filter((hub) => {
    if (filter.types && filter.types.length > 0 && !filter.types.includes(hub.type)) {
      return false;
    }
    if (
      filter.countries &&
      filter.countries.length > 0 &&
      !filter.countries.includes(hub.location.country ?? "")
    ) {
      return false;
    }
    if (filter.activeOnly && hub.status === "inactive") {
      return false;
    }
    if (q && !SEARCH_FIELDS(hub).includes(q)) {
      return false;
    }
    return true;
  });
}

/** Sorted, de-duplicated list of countries present in the data, for the filter UI. */
export function uniqueCountries(hubs: Hub[]): string[] {
  const set = new Set<string>();
  for (const hub of hubs) {
    if (hub.location.country) set.add(hub.location.country);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
