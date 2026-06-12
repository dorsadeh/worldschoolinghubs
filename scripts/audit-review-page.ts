/**
 * Generate data/research/link-audit-review.html — a self-contained interactive
 * review page where the user can Approve/Reject each actionable audit record
 * and download a link-audit-decisions.json file.
 *
 * Usage: npm run audit:review
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const AUDIT = join(RESEARCH, "link-audit.json");
const OUT = join(RESEARCH, "link-audit-review.html");

interface AuditRecord {
  id: string;
  name: string;
  category: string;
  country: string;
  url: string | null;
  status: number | null;
  finalUrl: string | null;
  verdict: string;
  latestYear: number | null;
  checkedAt: string;
  proposedUrl?: string | null;
  proposedUrlType?: string;
  proposedCategory?: string;
  resolutionNote?: string;
}
interface AuditFile {
  generatedAt: string;
  counts: Record<string, number>;
  suspectedAggregators: string[];
  records: AuditRecord[];
}

function escapeJson(json: string): string {
  // Prevent </script> injection
  return json.replace(/<\//g, "<\\/");
}

function verdictColor(verdict: string): string {
  const map: Record<string, string> = {
    "aggregator-link": "#7c3aed",
    "no-url": "#9f6212",
    "unreachable": "#b45309",
    "redirected": "#1d4ed8",
    "dead": "#b3261e",
    "parked": "#6b7280",
  };
  return map[verdict] ?? "#4b5563";
}

function buildHtml(audit: AuditFile): string {
  const needsDecision = audit.records.filter(
    (r) => r.verdict !== "ok-provider" && r.verdict !== "ok-social",
  );
  const actionable = needsDecision.filter(
    (r) => r.proposedUrl != null || r.resolutionNote != null,
  );
  const awaiting = needsDecision.filter(
    (r) => r.proposedUrl == null && r.resolutionNote == null,
  );

  const verdictGroups = Array.from(new Set(actionable.map((r) => r.verdict))).sort();

  // Embed only the records the page needs
  const embeddedData = {
    generatedAt: audit.generatedAt,
    actionable,
    awaiting,
  };

  const safeJson = escapeJson(JSON.stringify(embeddedData));

  const CATEGORIES = ["", "junk", "online_communities"];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Link audit review</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  color-scheme: light;
  --green: #0e7a5f;
  --green-light: #d1fae5;
  --red: #b3261e;
  --red-light: #fde8e8;
  --zinc-50: #fafafa;
  --zinc-100: #f4f4f5;
  --zinc-200: #e4e4e7;
  --zinc-300: #d4d4d8;
  --zinc-400: #a1a1aa;
  --zinc-500: #71717a;
  --zinc-600: #52525b;
  --zinc-700: #3f3f46;
  --zinc-800: #27272a;
  --zinc-900: #18181b;
}
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--zinc-800);
  background: var(--zinc-50);
}
a { color: var(--green); text-decoration: underline; }
a:hover { opacity: 0.8; }

.page { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }

/* Header */
.header { margin-bottom: 20px; }
.header h1 { font-size: 20px; font-weight: 700; color: var(--zinc-900); }
.header .meta { font-size: 12px; color: var(--zinc-500); margin-top: 2px; }
.progress-bar-wrap { margin-top: 12px; background: var(--zinc-200); border-radius: 4px; height: 6px; }
.progress-bar { height: 6px; border-radius: 4px; background: var(--green); transition: width 0.2s; }
.progress-stats { display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: var(--zinc-600); }
.stat-approved { color: var(--green); font-weight: 600; }
.stat-rejected { color: var(--red); font-weight: 600; }

/* Filter chips */
.filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.chip {
  border: 1px solid var(--zinc-300);
  background: white;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, border-color 0.1s;
  color: var(--zinc-700);
}
.chip:hover { border-color: var(--zinc-400); background: var(--zinc-100); }
.chip.active { background: var(--zinc-800); border-color: var(--zinc-800); color: white; }

/* Card */
.card {
  background: white;
  border: 1px solid var(--zinc-200);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.card.decided-approve {
  border-color: var(--green);
  background: #f0fdf4;
}
.card.decided-reject {
  border-color: var(--red);
  background: #fff5f5;
}
.card.hidden { display: none; }

.card-header { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.card-name { font-size: 15px; font-weight: 600; color: var(--zinc-900); flex: 1 1 0; min-width: 200px; }
.card-id { font-size: 11px; color: var(--zinc-400); font-weight: 400; display: block; margin-top: 1px; }
.badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
  white-space: nowrap; color: white;
}
.card-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-size: 12px; color: var(--zinc-600); }
.card-meta .label { color: var(--zinc-400); margin-right: 3px; }
.card-note {
  margin-top: 8px; font-size: 12px; color: var(--zinc-600); background: var(--zinc-100);
  border-left: 3px solid var(--zinc-300); padding: 6px 10px; border-radius: 0 4px 4px 0;
}

/* Controls */
.card-controls { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.btn {
  font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  padding: 5px 14px; border-radius: 5px; border: 1px solid transparent;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.btn-approve {
  background: white; color: var(--green); border-color: var(--green);
}
.btn-approve:hover, .btn-approve.active {
  background: var(--green); color: white;
}
.btn-reject {
  background: white; color: var(--red); border-color: var(--red);
}
.btn-reject:hover, .btn-reject.active {
  background: var(--red); color: white;
}
.btn-edit-toggle {
  background: none; color: var(--zinc-500); border: 1px solid var(--zinc-300);
  font-size: 12px;
}
.btn-edit-toggle:hover { border-color: var(--zinc-400); color: var(--zinc-700); }

/* Edit disclosure */
.edit-disclosure {
  display: none; margin-top: 12px; padding: 12px; background: var(--zinc-50);
  border: 1px solid var(--zinc-200); border-radius: 6px;
}
.edit-disclosure.open { display: block; }
.edit-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
@media (max-width: 600px) { .edit-grid { grid-template-columns: 1fr; } }
.edit-group { display: flex; flex-direction: column; gap: 3px; }
.edit-group label { font-size: 11px; color: var(--zinc-500); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.edit-group input, .edit-group select {
  font-family: inherit; font-size: 12px; padding: 5px 8px;
  border: 1px solid var(--zinc-300); border-radius: 4px;
  background: white; color: var(--zinc-800);
}
.edit-group input:focus, .edit-group select:focus {
  outline: 2px solid var(--green); outline-offset: -1px;
}

/* Awaiting section */
.awaiting-summary {
  border: 1px solid var(--zinc-200); border-radius: 8px; background: white;
  margin-top: 28px;
}
.awaiting-summary summary {
  padding: 12px 16px; cursor: pointer; font-size: 13px; font-weight: 600;
  color: var(--zinc-600); list-style: none; display: flex; align-items: center; gap: 6px;
  user-select: none;
}
.awaiting-summary summary::-webkit-details-marker { display: none; }
.awaiting-summary summary::before { content: "\\25B6"; font-size: 9px; transition: transform 0.15s; }
.awaiting-summary[open] summary::before { transform: rotate(90deg); }
.awaiting-list { padding: 0 16px 12px; }
.awaiting-row {
  display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--zinc-100);
  font-size: 12px; align-items: center; flex-wrap: wrap;
}
.awaiting-row:first-child { border-top: none; }
.awaiting-name { flex: 1 1 180px; color: var(--zinc-700); }
.awaiting-meta { color: var(--zinc-400); }

/* Export section */
.export-section { margin-top: 32px; padding: 16px; background: white; border: 1px solid var(--zinc-200); border-radius: 8px; }
.export-section h2 { font-size: 15px; font-weight: 700; margin-bottom: 8px; color: var(--zinc-900); }
.btn-export {
  background: var(--zinc-800); color: white; border: none; font-family: inherit;
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 18px; border-radius: 6px;
}
.btn-export:hover { background: var(--zinc-900); }
.export-hint { margin-top: 8px; font-size: 12px; color: var(--zinc-500); }
.export-hint code {
  background: var(--zinc-100); border: 1px solid var(--zinc-200);
  padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: ui-monospace, monospace;
}
</style>
</head>
<body>
<div class="page">

<div class="header">
  <h1>Link audit review</h1>
  <div class="meta" id="meta-line"></div>
  <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar" style="width:0%"></div></div>
  <div class="progress-stats" id="progress-stats"></div>
</div>

<div class="filter-row" id="filter-row"></div>

<div id="card-list"></div>

<details class="awaiting-summary" id="awaiting-section">
  <summary>Awaiting resolution (<span id="awaiting-count">0</span> records — no proposal yet, info only)</summary>
  <div class="awaiting-list" id="awaiting-list"></div>
</details>

<div class="export-section">
  <h2>Export decisions</h2>
  <button class="btn-export" id="btn-export">Download link-audit-decisions.json</button>
  <div class="export-hint">
    Save as <code>data/research/link-audit-decisions.json</code> then run:
    <code>npm run audit:apply</code>
  </div>
</div>

</div>

<script>
(function () {
  const DATA = ${safeJson};

  const VERDICT_COLORS = ${JSON.stringify(
    Object.fromEntries(
      verdictGroups.map((v) => [v, verdictColor(v)]),
    ),
  )};

  const VERSION_KEY = "audit-review-v:" + DATA.generatedAt;
  const STATE_KEY = "audit-review-state";

  // State shape: { version: string, decisions: { [id]: { decision: "approve"|"reject", url?: string, urlType?: string, category?: string } | null } }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed.version !== VERSION_KEY) return {};
      return parsed.decisions || {};
    } catch { return {}; }
  }
  function saveState(decisions) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ version: VERSION_KEY, decisions }));
    } catch {}
  }

  const decisions = loadState();

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === "className") e.className = v;
      else if (k === "style") Object.assign(e.style, v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    });
    children.flat(Infinity).forEach(c => {
      if (c == null) return;
      e.append(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  function link(href, text) {
    if (!href) return document.createTextNode("—");
    const a = document.createElement("a");
    a.href = href; a.textContent = text || href;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  // ---- Rendering ----

  let activeFilter = "all";

  function verdictGroups() {
    const groups = new Set(DATA.actionable.map(r => r.verdict));
    return ["all", ...Array.from(groups).sort()];
  }

  function buildFilterChips() {
    const row = document.getElementById("filter-row");
    verdictGroups().forEach(v => {
      const count = v === "all" ? DATA.actionable.length : DATA.actionable.filter(r => r.verdict === v).length;
      const chip = el("button", {
        className: "chip" + (v === "all" ? " active" : ""),
        "data-verdict": v,
        onClick: () => setFilter(v),
      }, v === "all" ? "All (" + count + ")" : v + " (" + count + ")");
      row.appendChild(chip);
    });
  }

  function setFilter(v) {
    activeFilter = v;
    document.querySelectorAll(".chip").forEach(c => {
      c.classList.toggle("active", c.dataset.verdict === v);
    });
    DATA.actionable.forEach(r => {
      const card = document.getElementById("card-" + r.id);
      if (card) card.classList.toggle("hidden", v !== "all" && r.verdict !== v);
    });
  }

  function updateProgress() {
    const total = DATA.actionable.length;
    const decided = Object.values(decisions).filter(d => d !== null).length;
    const approved = Object.values(decisions).filter(d => d && d.decision === "approve").length;
    const rejected = Object.values(decisions).filter(d => d && d.decision === "reject").length;
    const pct = total > 0 ? (decided / total) * 100 : 0;
    document.getElementById("progress-bar").style.width = pct + "%";
    document.getElementById("progress-stats").innerHTML =
      "<span>" + decided + " of " + total + " decided</span>" +
      "<span class='stat-approved'>" + approved + " approved</span>" +
      "<span class='stat-rejected'>" + rejected + " rejected</span>";
  }

  function updateCardState(id) {
    const d = decisions[id];
    const card = document.getElementById("card-" + id);
    if (!card) return;
    card.classList.remove("decided-approve", "decided-reject");
    const btnA = card.querySelector(".btn-approve");
    const btnR = card.querySelector(".btn-reject");
    btnA.classList.remove("active");
    btnR.classList.remove("active");
    if (d) {
      if (d.decision === "approve") {
        card.classList.add("decided-approve");
        btnA.classList.add("active");
      } else if (d.decision === "reject") {
        card.classList.add("decided-reject");
        btnR.classList.add("active");
      }
    }
  }

  ${CATEGORIES.length > 0
    ? `const CATEGORIES = ${JSON.stringify(CATEGORIES)};`
    : "const CATEGORIES = [];"}

  function buildCard(r) {
    const urlEl = r.url ? link(r.url, r.url) : document.createTextNode("—");
    const proposedEl = r.proposedUrl ? link(r.proposedUrl, r.proposedUrl) : document.createTextNode("—");
    const proposedType = r.proposedUrlType ? el("span", { className: "awaiting-meta" }, " (" + r.proposedUrlType + ")") : null;
    const proposedCat = r.proposedCategory ? el("span", { className: "awaiting-meta" }, " cat: " + r.proposedCategory) : null;

    const badgeColor = VERDICT_COLORS[r.verdict] || "#6b7280";
    const badge = el("span", { className: "badge", style: { background: badgeColor } }, r.verdict);

    // Edit disclosure elements
    const urlInput = el("input", { type: "text", value: r.proposedUrl || "", placeholder: "https://..." });
    const typeSelect = el("select", {},
      el("option", { value: "site" }, "site"),
      el("option", { value: "social" }, "social"),
    );
    if (r.proposedUrlType === "social") typeSelect.value = "social";
    const catSelect = el("select", {},
      ...["", "junk", "online_communities"].map(c => el("option", { value: c }, c || "(none)"))
    );
    if (r.proposedCategory) catSelect.value = r.proposedCategory;

    const disclosure = el("div", { className: "edit-disclosure" },
      el("div", { className: "edit-grid" },
        el("div", { className: "edit-group" },
          el("label", {}, "URL"),
          urlInput,
        ),
        el("div", { className: "edit-group" },
          el("label", {}, "Type"),
          typeSelect,
        ),
        el("div", { className: "edit-group" },
          el("label", {}, "Category"),
          catSelect,
        ),
      )
    );

    function approve() {
      const d = { decision: "approve" };
      // If the edit disclosure is open, fields the user changed become explicit overrides
      if (disclosure.classList.contains("open")) {
        const url = urlInput.value.trim() || r.proposedUrl || null;
        const type = typeSelect.value;
        const cat = catSelect.value;
        if (url && (url !== r.proposedUrl || type !== (r.proposedUrlType || "site"))) {
          d.url = url;
          d.urlType = type;
        }
        if (cat && cat !== (r.proposedCategory || "")) d.category = cat;
      }
      // plain approve (no edits) — audit:apply falls back to the record's proposals
      decisions[r.id] = d;
      saveState(decisions);
      updateCardState(r.id);
      updateProgress();
    }

    function reject() {
      decisions[r.id] = { decision: "reject" };
      saveState(decisions);
      updateCardState(r.id);
      updateProgress();
    }

    const btnApprove = el("button", { className: "btn btn-approve", onClick: approve }, "Approve");
    const btnReject = el("button", { className: "btn btn-reject", onClick: reject }, "Reject");
    const btnEdit = el("button", { className: "btn btn-edit-toggle", onClick: () => {
      disclosure.classList.toggle("open");
      btnEdit.textContent = disclosure.classList.contains("open") ? "Close edit" : "Edit fields";
    } }, "Edit fields");

    const noteEl = r.resolutionNote
      ? el("div", { className: "card-note" }, r.resolutionNote)
      : null;

    // Current URL row
    const metaItems = [];
    metaItems.push(el("span", {}, el("span", { className: "label" }, "country: "), r.country || "—"));
    metaItems.push(el("span", {}, el("span", { className: "label" }, "year: "), String(r.latestYear ?? "—")));
    metaItems.push(el("span", {}, el("span", { className: "label" }, "current: "), urlEl));
    if (r.proposedUrl) {
      const pSpan = document.createElement("span");
      pSpan.appendChild(el("span", { className: "label" }, "proposed: "));
      pSpan.appendChild(proposedEl);
      if (proposedType) pSpan.appendChild(proposedType);
      if (proposedCat) pSpan.appendChild(proposedCat);
      metaItems.push(pSpan);
    }

    const card = el("div", { className: "card", id: "card-" + r.id },
      el("div", { className: "card-header" },
        el("div", { className: "card-name" },
          r.name,
          el("span", { className: "card-id" }, r.id),
        ),
        badge,
      ),
      el("div", { className: "card-meta" }, ...metaItems),
      noteEl,
      el("div", { className: "card-controls" },
        btnApprove, btnReject, btnEdit,
      ),
      disclosure,
    );

    return card;
  }

  function buildAwaitingList() {
    const list = document.getElementById("awaiting-list");
    document.getElementById("awaiting-count").textContent = String(DATA.awaiting.length);
    DATA.awaiting.forEach(r => {
      const badgeColor = VERDICT_COLORS[r.verdict] || "#6b7280";
      const badge = el("span", { className: "badge", style: { background: badgeColor } }, r.verdict);
      const row = el("div", { className: "awaiting-row" },
        el("span", { className: "awaiting-name" }, r.name, " ", el("span", { className: "awaiting-meta" }, r.id)),
        badge,
        el("span", { className: "awaiting-meta" }, r.country || ""),
        r.url ? link(r.url, "link") : el("span", { className: "awaiting-meta" }, "no url"),
      );
      list.appendChild(row);
    });
  }

  function buildExport() {
    document.getElementById("btn-export").addEventListener("click", () => {
      const out = {};
      for (const [id, d] of Object.entries(decisions)) {
        if (!d || !d.decision) continue;
        if (d.decision === "reject") {
          out[id] = { decision: "reject" };
        } else if (d.decision === "approve") {
          const entry = { decision: "approve" };
          if (d.url) {
            entry.website = d.url;
            entry.websiteType = d.urlType || "site";
          }
          if (d.category) entry.category = d.category;
          out[id] = entry;
        }
      }
      const blob = new Blob([JSON.stringify(out, null, 2) + "\\n"], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "link-audit-decisions.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function init() {
    document.getElementById("meta-line").textContent =
      "Generated from audit " + DATA.generatedAt + " — " + DATA.actionable.length + " actionable / " + DATA.awaiting.length + " awaiting";

    buildFilterChips();

    const list = document.getElementById("card-list");
    DATA.actionable.forEach(r => {
      list.appendChild(buildCard(r));
      updateCardState(r.id);
    });

    buildAwaitingList();
    buildExport();
    updateProgress();
  }

  init();
})();
</script>
</body>
</html>
`;
}

function main() {
  if (!existsSync(AUDIT)) {
    console.error(`${AUDIT} not found — run \`npm run audit:links\` first.`);
    process.exit(1);
  }
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as AuditFile;
  const html = buildHtml(audit);
  writeFileSync(OUT, html);
  console.log("wrote", OUT);
}

main();
