/**
 * Render data/research/link-audit.json into a human review report:
 * docs/link-audit-YYYY-MM-DD.md, grouped by proposed action.
 *
 * Usage: npm run audit:report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const AUDIT = join(RESEARCH, "link-audit.json");

interface AuditRecord {
  id: string; name: string; category: string; country: string;
  url: string | null; status: number | null; finalUrl: string | null;
  verdict: string; latestYear: number | null; checkedAt: string;
  proposedUrl?: string | null; proposedUrlType?: string;
  proposedCategory?: string; resolutionNote?: string;
}
interface AuditFile {
  generatedAt: string; counts: Record<string, number>;
  suspectedAggregators: string[]; records: AuditRecord[];
}

const cell = (s: string | number | null | undefined) =>
  String(s ?? "—").replace(/\|/g, "\\|");

function table(rows: AuditRecord[], withProposed: boolean): string {
  const head = withProposed
    ? "| id | name | country | current url | year | proposed | note |\n|---|---|---|---|---|---|---|"
    : "| id | name | country | current url | status | year |\n|---|---|---|---|---|---|";
  const body = rows.map((r) => withProposed
    ? `| ${cell(r.id)} | ${cell(r.name)} | ${cell(r.country)} | ${cell(r.url)} | ${cell(r.latestYear)} | ${cell(r.proposedUrl)} | ${cell(r.resolutionNote)} |`
    : `| ${cell(r.id)} | ${cell(r.name)} | ${cell(r.country)} | ${cell(r.url)} | ${cell(r.status)} | ${cell(r.latestYear)} |`,
  ).join("\n");
  return `${head}\n${body}\n`;
}

function main() {
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as AuditFile;
  const date = new Date().toISOString().slice(0, 10);
  const OUT = join(process.cwd(), "docs", `link-audit-${date}.md`);
  const currentYear = new Date().getFullYear();

  const by = (v: string) => audit.records.filter((r) => r.verdict === v);
  const defunct = audit.records.filter(
    (r) => (r.verdict === "ok-provider" || r.verdict === "ok-social") &&
           r.latestYear !== null && r.latestYear <= currentYear - 2);

  const sections: [string, AuditRecord[], boolean, string][] = [
    ["Aggregator links — replace with provider link", by("aggregator-link"), true,
     "These entries' `url` points at an aggregator directory. Approving applies `proposed` as the new website."],
    ["Dead — propose junk or replacement", by("dead"), true,
     "Two failed checks ≥7 days apart. If no provider link could be found, approving moves the entry to the hidden `junk` category."],
    ["Parked domains", by("parked"), true, ""],
    ["Unreachable (first failure — re-run audit in ≥7 days to confirm)", by("unreachable"), false, ""],
    ["Redirected cross-domain — confirm the new home", by("redirected"), true, ""],
    ["No URL at all — targets for provider resolution / FB ritual", by("no-url"), true, ""],
    ["Possibly defunct — page's newest mentioned year is stale", defunct, false, ""],
  ];

  let md = `# Link audit — ${date}\n\nGenerated ${audit.generatedAt} from \`data/research/link-audit.json\`.\n\n`;
  md += `## Summary\n\n| verdict | count |\n|---|---|\n`;
  for (const [v, n] of Object.entries(audit.counts).sort()) md += `| ${v} | ${n} |\n`;
  md += `\n## Suspected aggregator domains (≥3 entries each — confirm & add to registry)\n\n`;
  md += audit.suspectedAggregators.length
    ? audit.suspectedAggregators.map((d) => `- ${d}`).join("\n") + "\n"
    : "_none_\n";
  for (const [title, rows, withProposed, blurb] of sections) {
    md += `\n## ${title} (${rows.length})\n\n`;
    if (blurb) md += blurb + "\n\n";
    md += rows.length ? table(rows, withProposed) : "_none_\n";
  }
  md += `\n## How to act on this report\n\nWrite decisions into \`data/research/link-audit-decisions.json\` as\n\`{"<id>": {"decision": "approve" | "reject", "website"?, "websiteType"?, "category"?}}\`\n(approve with no fields = take the record's proposed values), then run \`npm run audit:apply\`\nand rebuild with \`data/research/make.sh --no-fetch && npm run build:explorer\`.\n`;

  writeFileSync(OUT, md);
  console.log("wrote", OUT);
}

main();
