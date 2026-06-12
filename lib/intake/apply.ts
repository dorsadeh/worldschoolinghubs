export interface AuditDecision {
  decision: "approve" | "reject";
  website?: string;
  websiteType?: "site" | "social";
  category?: string;
}
export type DecisionsFile = Record<string, AuditDecision>;

export interface OverrideEntry {
  website?: string;
  websiteType?: "site" | "social";
  category?: string;
  // Some entries carry a `categories` array (backfilled curation); preserved via spread at runtime.
  categories?: string[];
}

interface ProposalSource {
  id: string;
  proposedUrl?: string | null;
  proposedUrlType?: "site" | "social";
  proposedCategory?: string;
}

/** Merge approved decisions (decision fields win over record proposals) into overrides. */
export function applyDecisions(
  records: ProposalSource[],
  decisions: DecisionsFile,
  existing: Record<string, OverrideEntry>,
): Record<string, OverrideEntry> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const out: Record<string, OverrideEntry> = { ...existing };
  for (const [id, d] of Object.entries(decisions)) {
    if (d.decision !== "approve") continue;
    const rec = byId.get(id);
    const entry: OverrideEntry = { ...out[id] };
    const website = d.website ?? rec?.proposedUrl ?? undefined;
    if (website) {
      entry.website = website;
      entry.websiteType = d.websiteType ?? rec?.proposedUrlType ?? "site";
    }
    const category = d.category ?? rec?.proposedCategory;
    if (category) entry.category = category;
    if (Object.keys(entry).length > 0) out[id] = entry;
  }
  return out;
}
