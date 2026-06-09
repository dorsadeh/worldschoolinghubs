import type { CostBucket } from "./directory";

/**
 * Bucket a free-text price into a coarse band. Numeric amounts are normalized
 * toward a monthly figure where the unit is given. Blank / "varies" → "unlisted",
 * which the UI keeps visible by default. Thresholds are tunable, not a hard spec.
 */
export function costBucket(price: string): CostBucket {
  const s = (price || "").toLowerCase().trim();
  if (!s) return "unlisted";
  if (/\bvaries\b|\btbd\b|to be |depends|inquire|contact|n\/a/.test(s)) return "unlisted";
  if (/\bfree\b|no cost|no charge/.test(s)) return "free";

  const nums = [...s.matchAll(/[$€£]\s?([\d,]+(?:\.\d+)?)|([\d,]+)\s?(?:usd|eur|gbp)/g)]
    .map((m) => parseFloat((m[1] ?? m[2]).replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (nums.length > 0) {
    const amt = Math.min(...nums);
    const perWeek = /week|\/wk|weekly/.test(s);
    const monthly = perWeek ? amt * 4 : amt;
    if (monthly < 800) return "low";
    if (monthly <= 2500) return "mid";
    return "high";
  }

  if (/low cost|cheap|affordable|budget|low-cost/.test(s)) return "low";
  return "unlisted";
}
