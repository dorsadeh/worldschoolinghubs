import { readFileSync } from "node:fs";
import { join } from "node:path";

export type AggregatorRegistry = Record<string, { note: string }>;

const DEFAULT_PATH = join(process.cwd(), "data", "research", "aggregator-domains.json");

export function loadAggregatorRegistry(path: string = DEFAULT_PATH): AggregatorRegistry {
  return JSON.parse(readFileSync(path, "utf8")) as AggregatorRegistry;
}

/** Blank → null; scheme-less directory urls get https://. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Hostname without leading www., lowercased; "" when unparsable. */
export function domainOf(url: string): string {
  const n = normalizeUrl(url);
  if (!n) return "";
  try {
    const hostname = new URL(n).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    // Reject hostnames with characters that are invalid in DNS labels
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(hostname)) return "";
    return hostname;
  } catch {
    return "";
  }
}

export function isAggregatorUrl(url: string | null, registry: AggregatorRegistry): boolean {
  if (!url) return false;
  const d = domainOf(url);
  if (!d) return false;
  return Object.keys(registry).some((agg) => d === agg || d.endsWith("." + agg));
}
