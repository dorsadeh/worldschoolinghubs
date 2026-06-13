export interface ScrapeSiteConfig {
  index?: string[];
  paginate?: string;      // "{index}page/{n}/" or absolute "https://.../page/{n}/"
  maxPages?: number;
  linkPattern?: string;   // regex with ONE capture group = slug
  unsupported?: string;
}

export type Listings = Record<string, string>; // slug → url

export function extractSlugs(html: string, linkPattern: string): Listings {
  if (!/\([^?]/.test(linkPattern)) {
    throw new Error(`extractSlugs: linkPattern must have a capture group: ${linkPattern}`);
  }
  const re = new RegExp(linkPattern, "g");
  const out: Listings = {};
  for (const m of html.matchAll(re)) out[m[1]] ??= m[0];
  return out;
}

export function slugToName(slug: string): string {
  return slug.split("-").filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function diffListings(current: Listings, prev: Listings | null): Listings {
  if (!prev) return { ...current };
  return Object.fromEntries(Object.entries(current).filter(([slug]) => !(slug in prev)));
}
