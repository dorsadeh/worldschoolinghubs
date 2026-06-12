import { domainOf, isAggregatorUrl, type AggregatorRegistry } from "./registry";

export type LinkVerdict =
  | "ok-provider" | "ok-social" | "aggregator-link" | "redirected"
  | "parked" | "unreachable" | "dead" | "no-url";

const SOCIAL_DOMAINS = new Set([
  "facebook.com", "fb.com", "fb.me",
  "instagram.com", "chat.whatsapp.com", "whatsapp.com", "t.me", "linktr.ee",
]);

export function isSocialUrl(url: string): boolean {
  const d = domainOf(url);
  if (!d) return false;
  return SOCIAL_DOMAINS.has(d) || [...SOCIAL_DOMAINS].some((s) => d.endsWith("." + s));
}

export interface FetchOutcome {
  url: string;
  status: number | null;   // null = network error / timeout
  finalUrl: string | null; // after redirects
  bodyText: string;        // "" on failure
}

export interface PrevCheck { verdict: LinkVerdict; checkedAt: string }

const PARKED_RE =
  /(domain (is|may be) for sale|buy this domain(?!\s+name)|domain parking|parked free|this domain has expired)/i;

const DAY_MS = 86_400_000;

export function classifyLink(
  outcome: FetchOutcome,
  registry: AggregatorRegistry,
  prev?: PrevCheck,
  nowIso: string = new Date().toISOString(),
): LinkVerdict {
  if (!outcome.url.trim()) return "no-url";
  const failed = outcome.status === null || outcome.status >= 400;
  if (failed) {
    if (prev?.verdict === "dead") return "dead"; // once dead, stays dead on further failures
    if (prev?.verdict === "unreachable") {
      const prevMs = Date.parse(prev.checkedAt);
      const nowMs = Date.parse(nowIso);
      if (!Number.isNaN(prevMs) && !Number.isNaN(nowMs) && nowMs - prevMs >= 7 * DAY_MS) {
        return "dead";
      }
    }
    return "unreachable";
  }
  const target = outcome.finalUrl || outcome.url;
  if (isAggregatorUrl(target, registry)) return "aggregator-link";
  if (isSocialUrl(target)) return "ok-social";
  if (PARKED_RE.test(outcome.bodyText)) return "parked";
  if (domainOf(target) !== domainOf(outcome.url)) return "redirected";
  return "ok-provider";
}

/** Newest year in the text, capped at currentYear+2 to skip phone numbers etc. */
export function latestYearMentioned(
  text: string,
  currentYear: number = new Date().getFullYear(),
): number | null {
  let max: number | null = null;
  for (const m of text.matchAll(/\b(20[0-9]{2})\b/g)) {
    const y = Number(m[1]);
    if (y <= currentYear + 2 && (max === null || y > max)) max = y;
  }
  return max;
}

/** Domains used by ≥3 entries that are neither registered aggregators nor social. */
export function suspectedAggregatorDomains(
  urls: string[],
  registry: AggregatorRegistry,
): string[] {
  const counts = new Map<string, number>();
  for (const u of urls) {
    const d = domainOf(u);
    if (!d || isAggregatorUrl(u, registry) || isSocialUrl(u)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([d]) => d).sort();
}
