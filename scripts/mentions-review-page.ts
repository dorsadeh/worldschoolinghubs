// scripts/mentions-review-page.ts
/**
 * Generate data/research/mentions/organic-places-review.html — self-contained review of
 * scored organic places. Approve/Reject per place; exports organic-places-decisions.json.
 *
 * Usage: npm run mentions:review
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MENT = join(process.cwd(), "data", "research", "mentions");
const SCORED = join(MENT, "organic-places-scored.json");
const OUT = join(MENT, "organic-places-review.html");

function escapeJson(json: string): string { return json.replace(/<\//g, "<\\/"); }

function buildHtml(safeJson: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Organic-places review</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light;--green:#0e7a5f;--red:#b3261e;--amber:#b45309;
--zinc-50:#fafafa;--zinc-100:#f4f4f5;--zinc-200:#e4e4e7;--zinc-300:#d4d4d8;
--zinc-400:#a1a1aa;--zinc-500:#71717a;--zinc-600:#52525b;--zinc-800:#27272a;--zinc-900:#18181b}
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:var(--zinc-800);background:var(--zinc-50)}
a{color:var(--green)} .page{max-width:880px;margin:0 auto;padding:24px 16px 64px}
.header h1{font-size:20px;font-weight:700;color:var(--zinc-900)} .header .meta{font-size:12px;color:var(--zinc-500);margin-top:2px}
.progress-stats{display:flex;gap:16px;margin:10px 0 16px;font-size:12px;color:var(--zinc-600)}
.stat-approved{color:var(--green);font-weight:600} .stat-rejected{color:var(--red);font-weight:600}
.filter-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.chip{border:1px solid var(--zinc-300);background:#fff;border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer;color:var(--zinc-600)}
.chip.active{background:var(--zinc-800);border-color:var(--zinc-800);color:#fff}
.card{background:#fff;border:1px solid var(--zinc-200);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.card.decided-approve{border-color:var(--green);background:#f0fdf4} .card.decided-reject{border-color:var(--red);background:#fff5f5}
.card.hidden{display:none}
.card-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.card-name{font-size:15px;font-weight:600;color:var(--zinc-900);flex:1 1 0;min-width:180px}
.score{font-size:18px;font-weight:700;color:var(--zinc-900)} .indep{font-size:12px;color:var(--zinc-500)}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;color:#fff;white-space:nowrap}
.tier-established{background:#0e7a5f} .tier-emerging{background:#2563eb} .tier-watch{background:#6b7280}
.indir{background:var(--amber)}
.sources{margin-top:8px;font-size:12px;color:var(--zinc-600)} .src{margin-top:3px;padding-left:10px}
.src .k{color:var(--zinc-400);margin-right:5px} .src .snip{color:var(--zinc-500)}
.controls{display:flex;gap:8px;margin-top:12px}
.btn{font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:5px 14px;border-radius:5px;border:1px solid transparent}
.btn-approve{background:#fff;color:var(--green);border-color:var(--green)} .btn-approve.active{background:var(--green);color:#fff}
.btn-reject{background:#fff;color:var(--red);border-color:var(--red)} .btn-reject.active{background:var(--red);color:#fff}
.export{margin-top:28px;padding:16px;background:#fff;border:1px solid var(--zinc-200);border-radius:8px}
.btn-export{background:var(--zinc-800);color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:8px 18px;border-radius:6px}
.hint{margin-top:8px;font-size:12px;color:var(--zinc-500)} code{background:var(--zinc-100);border:1px solid var(--zinc-200);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace;font-size:11px}
</style></head><body><div class="page">
<div class="header"><h1>Organic-places review</h1><div class="meta" id="meta"></div></div>
<div class="progress-stats" id="stats"></div>
<div class="filter-row" id="filters"></div>
<div id="list"></div>
<div class="export"><button class="btn-export" id="export">Download organic-places-decisions.json</button>
<div class="hint">Save to <code>data/research/mentions/organic-places-decisions.json</code> (ingestion is a separate later step).</div></div>
</div>
<script>
(function(){
  const DATA = ${safeJson};
  const STATE_KEY = "organic-places-review-state";
  const VERSION = "v:" + DATA.computedAt;
  function load(){try{const r=localStorage.getItem(STATE_KEY);if(!r)return{};const p=JSON.parse(r);return p.version===VERSION?(p.decisions||{}):{}}catch{return{}}}
  function save(d){try{localStorage.setItem(STATE_KEY,JSON.stringify({version:VERSION,decisions:d}))}catch{}}
  const decisions = load();
  let filter = "all";
  function el(t,a,...c){const e=document.createElement(t);if(a)for(const[k,v]of Object.entries(a)){if(k==="className")e.className=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2).toLowerCase(),v);else e.setAttribute(k,v)}c.flat(Infinity).forEach(x=>{if(x==null)return;e.append(typeof x==="string"?document.createTextNode(x):x)});return e}
  function link(href,text){if(!href)return document.createTextNode("—");let ok=false;try{ok=["http:","https:"].includes(new URL(href).protocol)}catch{}if(!ok)return document.createTextNode(text||href);const a=document.createElement("a");a.href=href;a.textContent=text||href;a.target="_blank";a.rel="noopener noreferrer";return a}
  function stats(){const t=DATA.places.length;const vals=Object.values(decisions);const ap=vals.filter(d=>d&&d.decision==="approve").length;const rj=vals.filter(d=>d&&d.decision==="reject").length;document.getElementById("stats").innerHTML="<span>"+(ap+rj)+" of "+t+" decided</span><span class='stat-approved'>"+ap+" approved</span><span class='stat-rejected'>"+rj+" rejected</span>"}
  function cardState(id){const d=decisions[id];const c=document.getElementById("c-"+id);if(!c)return;c.classList.remove("decided-approve","decided-reject");const a=c.querySelector(".btn-approve"),r=c.querySelector(".btn-reject");a.classList.remove("active");r.classList.remove("active");if(d&&d.decision==="approve"){c.classList.add("decided-approve");a.classList.add("active")}if(d&&d.decision==="reject"){c.classList.add("decided-reject");r.classList.add("active")}}
  function buildFilters(){const tiers=["all","established","emerging","watch"];const row=document.getElementById("filters");tiers.forEach(t=>{const n=t==="all"?DATA.places.length:DATA.places.filter(p=>p.tier===t).length;row.appendChild(el("button",{className:"chip"+(t==="all"?" active":""),"data-t":t,onClick:()=>setFilter(t)},t+" ("+n+")"))})}
  function setFilter(t){filter=t;document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("active",c.dataset.t===t));DATA.places.forEach(p=>{const c=document.getElementById("c-"+p.placeId);if(c)c.classList.toggle("hidden",t!=="all"&&p.tier!==t)})}
  function card(p){
    const tierBadge=el("span",{className:"badge tier-"+p.tier},p.tier);
    const inDir=(p.matchedExistingHubIds&&p.matchedExistingHubIds.length)?el("span",{className:"badge indir"},"already in directory: "+p.matchedExistingHubIds.join(", ")):null;
    const head=el("div",{className:"card-head"},
      el("span",{className:"card-name"},p.canonicalName+(p.country?", "+p.country:"")),
      el("span",{className:"score"},String(p.score)),el("span",{className:"indep"},"· "+p.independentDomains+" indep"),
      tierBadge,inDir);
    const srcs=el("div",{className:"sources"},el("div",{},"sources ("+p.sources.length+"):"),
      ...p.sources.map(s=>el("div",{className:"src"},el("span",{className:"k"},s.kind+" · "+s.date),link(s.url,s.domain),s.snippet?el("div",{className:"snip"},s.snippet):null)));
    function set(dec){decisions[p.placeId]={decision:dec};save(decisions);cardState(p.placeId);stats()}
    const ctr=el("div",{className:"controls"},
      el("button",{className:"btn btn-approve",onClick:()=>set("approve")},"Approve"),
      el("button",{className:"btn btn-reject",onClick:()=>set("reject")},"Reject"));
    return el("div",{className:"card",id:"c-"+p.placeId},head,srcs,ctr);
  }
  function exportBtn(){document.getElementById("export").addEventListener("click",()=>{const out={};for(const[id,d]of Object.entries(decisions)){if(d&&d.decision)out[id]={decision:d.decision}}const blob=new Blob([JSON.stringify(out,null,2)+"\\n"],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="organic-places-decisions.json";a.click();URL.revokeObjectURL(a.href)})}
  function init(){document.getElementById("meta").textContent="Computed "+(DATA.computedAt||"—")+" — "+DATA.places.length+" places";buildFilters();const list=document.getElementById("list");DATA.places.forEach(p=>{list.appendChild(card(p));cardState(p.placeId)});exportBtn();stats()}
  init();
})();
</script></body></html>`;
}

function main() {
  if (!existsSync(SCORED)) { console.error("Run mentions:score first (organic-places-scored.json missing)."); process.exit(1); }
  const scored = JSON.parse(readFileSync(SCORED, "utf8")) as { places: unknown[] };
  writeFileSync(OUT, buildHtml(escapeJson(readFileSync(SCORED, "utf8"))));
  console.log(`wrote ${OUT} (${scored.places.length} places)`);
}

main();
