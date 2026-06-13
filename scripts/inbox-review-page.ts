/**
 * Generate data/research/inbox-review.html — self-contained interactive review
 * of inbox candidates. Approve/Reject/Edit per card; exports
 * inbox-decisions.json for `npm run inbox:apply`.
 *
 * Usage: npm run inbox:review
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const INBOX = join(RESEARCH, "inbox", "candidates.json");
const OUT = join(RESEARCH, "inbox-review.html");

function escapeJson(json: string): string {
  // Prevent </script> injection
  return json.replace(/<\//g, "<\\/");
}

function buildHtml(safeJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Inbox candidate review</title>
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
.card-evidence {
  margin-top: 8px; font-size: 12px; color: var(--zinc-600);
}
.card-evidence .evidence-label { color: var(--zinc-400); font-weight: 600; margin-right: 4px; }
.evidence-list { margin-top: 2px; padding-left: 12px; }
.evidence-item { margin-top: 2px; }
.evidence-asof { color: var(--zinc-400); margin-left: 6px; }
.dedupe-badge-amber {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 4px; background: #92400e; color: white; white-space: nowrap;
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
  <h1>Inbox candidate review</h1>
  <div class="meta" id="meta-line"></div>
  <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar" style="width:0%"></div></div>
  <div class="progress-stats" id="progress-stats"></div>
</div>

<div class="filter-row" id="filter-row"></div>

<div id="card-list"></div>

<div class="export-section">
  <h2>Export decisions</h2>
  <button class="btn-export" id="btn-export">Download inbox-decisions.json</button>
  <div class="export-hint">
    Save as <code>data/research/inbox/inbox-decisions.json</code> then run:
    <code>npm run inbox:apply</code>
  </div>
</div>

</div>

<script>
(function () {
  const DATA = ${safeJson};

  // STATE_KEY is versioned by the inbox's updatedAt so a regenerated inbox resets decisions
  const VERSION_KEY = "inbox-review-v:" + DATA.updatedAt;
  const STATE_KEY = "inbox-review-state";

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
    let ok = false;
    try { ok = ["http:", "https:"].includes(new URL(href).protocol); } catch (e) { ok = false; }
    if (!ok) return document.createTextNode(text || href);
    const a = document.createElement("a");
    a.href = href; a.textContent = text || href;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  // ---- Filter chips (by sourceChannel) ----

  let activeFilter = "all";

  function allChannels() {
    const channels = new Set(DATA.candidates.map(c => c.sourceChannel));
    return ["all", ...Array.from(channels).sort()];
  }

  function buildFilterChips() {
    const row = document.getElementById("filter-row");
    allChannels().forEach(ch => {
      const count = ch === "all"
        ? DATA.candidates.length
        : DATA.candidates.filter(c => c.sourceChannel === ch).length;
      const chip = el("button", {
        className: "chip" + (ch === "all" ? " active" : ""),
        "data-channel": ch,
        onClick: () => setFilter(ch),
      }, ch === "all" ? "All (" + count + ")" : ch + " (" + count + ")");
      row.appendChild(chip);
    });
  }

  function setFilter(ch) {
    activeFilter = ch;
    document.querySelectorAll(".chip").forEach(c => {
      c.classList.toggle("active", c.dataset.channel === ch);
    });
    DATA.candidates.forEach(c => {
      const card = document.getElementById("card-" + c.cid);
      if (card) card.classList.toggle("hidden", ch !== "all" && c.sourceChannel !== ch);
    });
  }

  // ---- Progress ----

  function updateProgress() {
    const total = DATA.candidates.length;
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

  function updateCardState(cid) {
    const d = decisions[cid];
    const card = document.getElementById("card-" + cid);
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

  // ---- Cards ----

  const CATEGORY_OPTIONS = [
    "", "organic", "permanent_commercial", "permanent_community",
    "popup", "traveling", "spanish_immersion"
  ];

  function buildCard(c) {
    // Source channel badge
    const channelBadge = el("span", {
      className: "badge",
      style: { background: "#2563eb" },
    }, c.sourceChannel);

    // Dedupe badge
    let dupeBadge = null;
    if (c.dedupe && c.dedupe.startsWith("possible-dup-of:")) {
      const target = c.dedupe.slice("possible-dup-of:".length);
      dupeBadge = el("span", { className: "dedupe-badge-amber" }, "possible-dup-of: " + target);
    } else if (c.dedupe && c.dedupe !== "new") {
      dupeBadge = el("span", { className: "badge", style: { background: "#6b7280" } }, c.dedupe);
    }

    // Meta line: country/region/claimedDates/categoryGuess
    const metaItems = [];
    if (c.country) metaItems.push(el("span", {}, el("span", { className: "label" }, "country: "), c.country));
    if (c.region) metaItems.push(el("span", {}, el("span", { className: "label" }, "region: "), c.region));
    if (c.claimedDates) metaItems.push(el("span", {}, el("span", { className: "label" }, "dates: "), c.claimedDates));
    if (c.categoryGuess) metaItems.push(el("span", {}, el("span", { className: "label" }, "category: "), c.categoryGuess));

    // Provider URL
    let providerUrlEl = null;
    if (c.providerUrl) {
      providerUrlEl = el("div", { className: "card-meta", style: { marginTop: "6px" } },
        el("span", {}, el("span", { className: "label" }, "url: "), link(c.providerUrl, c.providerUrl))
      );
    }

    // Evidence list
    let evidenceEl = null;
    if (c.evidence && c.evidence.length > 0) {
      const items = c.evidence.map(ev => {
        const isScreenshot = ev.url.startsWith("screenshot:");
        const urlNode = isScreenshot
          ? document.createTextNode(ev.url)
          : link(ev.url, ev.url);
        const asofNode = ev.asOf
          ? el("span", { className: "evidence-asof" }, "(" + ev.asOf + ")")
          : null;
        return el("div", { className: "evidence-item" }, urlNode, asofNode);
      });
      evidenceEl = el("div", { className: "card-evidence" },
        el("span", { className: "evidence-label" }, "evidence:"),
        el("div", { className: "evidence-list" }, ...items)
      );
    }

    // Notes
    const noteEl = c.notes
      ? el("div", { className: "card-note" }, c.notes)
      : null;

    // Edit disclosure inputs
    const nameInput = el("input", { type: "text", value: c.name || "", placeholder: "Hub name" });
    const countryInput = el("input", { type: "text", value: c.country || "", placeholder: "Country" });
    const regionInput = el("input", { type: "text", value: c.region || "", placeholder: "Region / city" });
    const categorySelect = el("select", {},
      ...CATEGORY_OPTIONS.map(opt => el("option", { value: opt }, opt || "(none)"))
    );
    if (c.categoryGuess) categorySelect.value = c.categoryGuess;
    const providerUrlInput = el("input", { type: "text", value: c.providerUrl || "", placeholder: "https://..." });
    const urlTypeSelect = el("select", {},
      el("option", { value: "site" }, "site"),
      el("option", { value: "social" }, "social"),
    );
    if (c.urlType) urlTypeSelect.value = c.urlType;

    const disclosure = el("div", { className: "edit-disclosure" },
      el("div", { className: "edit-grid" },
        el("div", { className: "edit-group" }, el("label", {}, "Name"), nameInput),
        el("div", { className: "edit-group" }, el("label", {}, "Country"), countryInput),
        el("div", { className: "edit-group" }, el("label", {}, "Region"), regionInput),
        el("div", { className: "edit-group" }, el("label", {}, "Category"), categorySelect),
        el("div", { className: "edit-group" }, el("label", {}, "Provider URL"), providerUrlInput),
        el("div", { className: "edit-group" }, el("label", {}, "URL type"), urlTypeSelect),
      )
    );

    // approve(): collect all fields that differ from the candidate's current value
    // Always read inputs — DOM retains values even when the edit panel is closed
    function approve() {
      const d = { decision: "approve" };
      const newName = nameInput.value.trim();
      const newCountry = countryInput.value.trim();
      const newRegion = regionInput.value.trim();
      const newCategory = categorySelect.value;
      const newProviderUrl = providerUrlInput.value.trim() || null;
      const newUrlType = urlTypeSelect.value;
      if (newName && newName !== c.name) d.name = newName;
      if (newCountry !== (c.country || "")) d.country = newCountry;
      if (newRegion !== (c.region || "")) d.region = newRegion;
      if (newCategory !== (c.categoryGuess || "")) d.categoryGuess = newCategory;
      if (newProviderUrl !== (c.providerUrl || null)) d.providerUrl = newProviderUrl;
      if (newUrlType !== (c.urlType || "site")) d.urlType = newUrlType;
      decisions[c.cid] = d;
      saveState(decisions);
      updateCardState(c.cid);
      updateProgress();
    }

    function reject() {
      decisions[c.cid] = { decision: "reject" };
      saveState(decisions);
      updateCardState(c.cid);
      updateProgress();
    }

    const btnApprove = el("button", { className: "btn btn-approve", onClick: approve }, "Approve");
    const btnReject = el("button", { className: "btn btn-reject", onClick: reject }, "Reject");
    const btnEdit = el("button", { className: "btn btn-edit-toggle", onClick: () => {
      disclosure.classList.toggle("open");
      btnEdit.textContent = disclosure.classList.contains("open") ? "Close edit" : "Edit fields";
    } }, "Edit fields");

    const badges = [channelBadge];
    if (dupeBadge) badges.push(dupeBadge);

    const card = el("div", { className: "card", id: "card-" + c.cid },
      el("div", { className: "card-header" },
        el("div", { className: "card-name" },
          c.name,
          el("span", { className: "card-id" }, c.cid),
        ),
        ...badges,
      ),
      metaItems.length > 0 ? el("div", { className: "card-meta" }, ...metaItems) : null,
      providerUrlEl,
      evidenceEl,
      noteEl,
      el("div", { className: "card-controls" },
        btnApprove, btnReject, btnEdit,
      ),
      disclosure,
    );

    return card;
  }

  // ---- Export ----

  function buildExport() {
    document.getElementById("btn-export").addEventListener("click", () => {
      const out = {};
      for (const [cid, d] of Object.entries(decisions)) {
        if (!d || !d.decision) continue;
        if (d.decision === "reject") {
          out[cid] = { decision: "reject" };
        } else if (d.decision === "approve") {
          // Include all explicit field overrides (everything except "decision" itself)
          const entry = { decision: "approve" };
          for (const [k, v] of Object.entries(d)) {
            if (k !== "decision") entry[k] = v;
          }
          out[cid] = entry;
        }
      }
      const blob = new Blob([JSON.stringify(out, null, 2) + "\\n"], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "inbox-decisions.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ---- Init ----

  function init() {
    document.getElementById("meta-line").textContent =
      "Inbox updated " + (DATA.updatedAt || "—") + " — " + DATA.candidates.length + " candidates";

    buildFilterChips();

    const list = document.getElementById("card-list");
    DATA.candidates.forEach(c => {
      list.appendChild(buildCard(c));
      updateCardState(c.cid);
    });

    buildExport();
    updateProgress();
  }

  init();
})();
</script>
</body>
</html>`;
}

function main() {
  if (!existsSync(INBOX)) {
    console.error(`${INBOX} not found.`);
    process.exit(1);
  }
  const inbox = JSON.parse(readFileSync(INBOX, "utf8"));
  const safeJson = escapeJson(JSON.stringify(inbox));
  writeFileSync(OUT, buildHtml(safeJson));
  console.log(`wrote ${OUT} (${inbox.candidates.length} candidates)`);
}

main();
