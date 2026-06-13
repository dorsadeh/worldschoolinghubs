/**
 * Generate a dated, self-contained LLM deep-research prompt for the discovery
 * sweep: the existing data/research/deep-research-prompt.md plus a generated
 * preamble (recency window, suppression list of known hubs, community/Hebrew
 * source targets). Paste the output file into ChatGPT/Gemini/Claude with web
 * access; transcribe results per data/research/sweep-ingestion-runbook.md.
 *
 * Usage: npm run discover:sweep-prompt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const BASE = join(RESEARCH, "deep-research-prompt.md");
const DIRJSON = join(RESEARCH, "directory-consolidated-2026-06-09.json");

function main() {
  const date = new Date().toISOString().slice(0, 10);
  const OUT = join(RESEARCH, `sweep-prompt-${date}.md`);
  const names = (JSON.parse(readFileSync(DIRJSON, "utf8")) as { name: string; country: string }[])
    .map((e) => `${e.name} (${e.country})`).sort();

  const preamble = `# DISCOVERY SWEEP — ${date}

This is a RECURRING sweep over an existing directory. Two changes to the task below:

1. **Recency focus.** Prioritize hubs, programs, pop-ups, and gatherings ANNOUNCED OR
   FIRST DOCUMENTED in the last ~6 months (and anything scheduled for the coming 12
   months). Long-established places we already track are listed below — skip them.

2. **Suppression list — we ALREADY KNOW these ${names.length} places/programs. Do NOT
   include them in your output (but a NEW location/edition of a known operator IS
   wanted, e.g. a new Boundless campus):**

${names.map((n) => `   - ${n}`).join("\n")}

3. **Community text sources — explicitly check these beyond the open web:**
   - Reddit: r/worldschooling, r/digitalnomad (family threads), r/homeschool travel threads
   - Facebook PUBLIC pages/groups surfaced by web search (don't log in)
   - Worldschooling newsletters and blogs (Wonder Year, World Travel Family, Passport Explorers …)
   - **Hebrew sources** (forums, blogs, Telegram/WhatsApp group mentions): search
     "וורלדסקולינג", "חינוך ביתי בחו"ל", "משפחות מטיילות" — Israeli-family clustering
     is a first-class signal for this directory.

4. **Output format per find:** name | country/region | type guess (organic town /
   permanent / pop-up / traveling / Spanish-immersion) | dates if any | first-party
   link if any | 1-line evidence + source URL + as-of date. Never invent links.

---

`;
  writeFileSync(OUT, preamble + readFileSync(BASE, "utf8"));
  console.log("wrote", OUT, `(${names.length} known hubs suppressed)`);
}

main();
