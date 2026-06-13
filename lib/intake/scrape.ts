export interface ScrapeSiteConfig {
  index?: string[];
  paginate?: string;      // "{index}page/{n}/" or absolute "https://.../page/{n}/"
  maxPages?: number;
  linkPattern?: string;   // regex with ONE capture group = slug
  unsupported?: string;
}

export type Listings = Record<string, string>; // slug → url

export function extractSlugs(html: string, linkPattern: string): Listings {
  if (!/\((?:[^?]|\?<)/.test(linkPattern)) {
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

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Newest plausible date in the page as YYYY-MM-DD, or null. Reads <time datetime>
 *  and "Month DD, YYYY" text; caps at currentYear+2 to skip garbage. */
export function extractListingDate(html: string, currentYear = new Date().getFullYear()): string | null {
  const found: string[] = [];
  for (const m of html.matchAll(/datetime="(\d{4})-(\d{2})-(\d{2})/g)) {
    if (Number(m[1]) <= currentYear + 2) found.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of html.matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/gi)) {
    const y = Number(m[3]);
    if (y <= currentYear + 2) found.push(`${m[3]}-${MONTHS[m[1].toLowerCase()]}-${String(m[2]).padStart(2, "0")}`);
  }
  return found.length ? found.sort().at(-1)! : null;
}

/** Human title from og:title then <h1>, trimmed; null if neither. */
export function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (og) return og[1].trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
  return null;
}
