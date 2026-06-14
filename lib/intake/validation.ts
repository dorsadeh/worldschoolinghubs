import { isAggregatorUrl, type AggregatorRegistry } from "./registry";

export type Disposition = "keep" | "fix" | "inactive" | "junk" | "merge";
export type Confidence = "high" | "medium" | "low";

export interface ValidationFields {
  country?: string; region?: string; category?: string; ages?: string;
  price?: string; season?: string; website?: string; websiteType?: "site" | "social";
}
export interface ValidationResult {
  id: string;
  status: "active" | "dead" | "uncertain";
  confidence: Confidence;
  fields: ValidationFields;
  latestSignOfLife?: string;
  dupOf?: string | null;
  disposition: Disposition;
  evidence?: string[];
  note?: string;
  model?: string;
}
export interface ResultsFile { validatedAt: string; results: ValidationResult[] }

export interface HubForValidation {
  id: string; name: string; country: string; category: string; website: string;
}

export interface OverrideEntry {
  website?: string; websiteType?: "site" | "social"; category?: string; facebook?: string;
}

function firstWord(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/)[0] ?? "";
}

/** Does this hub need the stronger model? True when it's a hard case:
 *  no link, currently inactive (recheck), a dup-candidate (its leading name word
 *  matches an existing operator's), or a prior haiku verdict wasn't high-confidence. */
export function needsSonnet(
  hub: HubForValidation,
  existingOperatorNames: string[],
  haikuResult?: ValidationResult,
): boolean {
  if (!hub.website.trim()) return true;
  if (hub.category === "inactive") return true;
  if (haikuResult && haikuResult.confidence !== "high") return true;
  const w = firstWord(hub.name);
  if (w.length >= 4 && existingOperatorNames.some((n) => firstWord(n) === w)) return true;
  return false;
}

/** High-confidence verdict → the override to apply, or null (no-op / flagged). */
export function validationToOverride(
  r: ValidationResult,
  registry: AggregatorRegistry,
): OverrideEntry | null {
  if (r.confidence !== "high") return null;
  switch (r.disposition) {
    case "keep":
      return null;
    case "junk":
    case "merge":
      return { category: "junk" };
    case "inactive":
      return { category: "inactive" };
    case "fix": {
      const o: OverrideEntry = {};
      const url = r.fields.website?.trim();
      if (url && !isAggregatorUrl(url, registry)) {
        o.website = url;
        o.websiteType = r.fields.websiteType ?? "site";
      }
      if (r.fields.category) o.category = r.fields.category;
      return Object.keys(o).length ? o : null;
    }
  }
}

/** Partition results into auto-apply (produces an override) vs flag (everything that
 *  needed a human: medium/low confidence, or unverifiable). keep@high is neither. */
export function partitionResults(
  results: ValidationResult[],
  registry: AggregatorRegistry,
): { apply: ValidationResult[]; flag: ValidationResult[] } {
  const apply: ValidationResult[] = [];
  const flag: ValidationResult[] = [];
  for (const r of results) {
    if (validationToOverride(r, registry)) apply.push(r);
    else if (r.confidence !== "high") flag.push(r);
    // else: high-confidence keep → no action
  }
  return { apply, flag };
}
