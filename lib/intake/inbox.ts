import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CandidateEvidence { url: string; asOf: string }

export interface InboxCandidate {
  cid: string;
  name: string;
  country?: string;
  region?: string;
  claimedDates?: string;
  categoryGuess?: string;
  providerUrl?: string | null;
  urlType?: "site" | "social";
  evidence: CandidateEvidence[];
  sourceChannel: string;
  notes?: string;
  dedupe: "new" | "known" | `possible-dup-of:${string}`;            // dedupe verdict
  addedAt: string;
}

export interface InboxFile { updatedAt: string; candidates: InboxCandidate[] }
export interface RejectedFile { names: string[] }
export interface DirEntry { id: string; name: string; country: string }

const RESEARCH = join(process.cwd(), "data", "research");
export const INBOX_PATH = join(RESEARCH, "inbox", "candidates.json");
export const REJECTED_PATH = join(RESEARCH, "inbox", "rejected.json");

export function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Mirrors build_directory.py: re.sub(r"[^a-z0-9]+","-",norm).strip("-")[:42] */
export function slugify(s: string): string {
  return normName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
}

export function candidateCid(name: string, sourceChannel: string): string {
  return `${slugify(name)}--${slugify(sourceChannel)}`;
}

export function dedupeVerdict(name: string, country: string | undefined, dir: DirEntry[]): string {
  const n = normName(name);
  const slug = slugify(name);
  for (const e of dir) {
    if (normName(e.name) === n || slugify(e.name) === slug) return "known";
  }
  if (country) {
    const c = normName(country);
    for (const e of dir) {
      const en = normName(e.name);
      const nTokens = new Set(n.split(/\s+/).filter(Boolean));
      const enTokens = new Set(en.split(/\s+/).filter(Boolean));
      const [smaller, larger] = nTokens.size <= enTokens.size ? [nTokens, enTokens] : [enTokens, nTokens];
      const subset = smaller.size > 0 && [...smaller].every((t) => larger.has(t));
      if (normName(e.country) === c && subset) {
        return `possible-dup-of:${e.id}`;
      }
    }
  }
  return "new";
}

export function isRejected(name: string, rejected: RejectedFile): boolean {
  return rejected.names.includes(normName(name));
}

export function loadInbox(path: string = INBOX_PATH): InboxFile {
  return JSON.parse(readFileSync(path, "utf8")) as InboxFile;
}
export function saveInbox(inbox: InboxFile, path: string = INBOX_PATH): void {
  inbox.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(inbox, null, 1) + "\n");
}
export function loadRejected(path: string = REJECTED_PATH): RejectedFile {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RejectedFile) : { names: [] };
}
export function saveRejected(rejected: RejectedFile, path: string = REJECTED_PATH): void {
  rejected.names = [...new Set(rejected.names.map(normName))].sort();
  writeFileSync(path, JSON.stringify(rejected, null, 1) + "\n");
}

/** Columns of candidate-hubs-2026-06-08.csv — build_directory.py reads these names. */
export const CSV_COLUMNS = [
  "name", "type", "country", "region_city", "season_dates", "ages", "price",
  "website", "facebook_instagram", "host", "source_directory", "confidence",
  "dedup_status", "notes",
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

export function candidateToCsvRow(c: InboxCandidate): CsvRow {
  const isSocial = c.urlType === "social";
  const url = c.providerUrl ?? "";
  return {
    name: c.name,
    type: c.categoryGuess ?? "",
    country: c.country ?? "",
    region_city: c.region ?? "",
    season_dates: c.claimedDates ?? "",
    ages: "",
    price: "",
    website: isSocial ? "" : url,
    facebook_instagram: isSocial ? url : "",
    host: "",
    source_directory: c.sourceChannel,
    confidence: "inbox",
    dedup_status: "NEW",
    notes: c.notes ?? "",
  };
}
