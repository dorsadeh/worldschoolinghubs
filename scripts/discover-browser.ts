/**
 * Browser-automation discovery channel: render JS-app aggregators (which static
 * scraping can't read) with headless Chrome, harvest listing candidates, append
 * to the inbox. Discovery-only: listing url → evidence, never providerUrl.
 *
 * Usage: npm run discover:browser
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import {
  loadInbox, saveInbox, loadRejected, isRejected, dedupeVerdict, candidateCid,
  type DirEntry, type InboxCandidate,
} from "../lib/intake/inbox";

const RESEARCH = join(process.cwd(), "data", "research");
const CONFIG = join(RESEARCH, "browser-scrape-config.json");
const DIRJSON = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const CHROME = process.env.CHROME_PATH || "/bin/google-chrome";

interface SiteCfg { startUrl: string; navHint: string; categoryGuess: string; sourceChannel: string }
interface SiteCfgMaybeUnsupported extends Partial<SiteCfg> { unsupported?: string }
interface Harvested { name: string; url: string; location?: string; dates?: string; listingDate?: string }

async function harvestFamunity(page: import("puppeteer-core").Page, startUrl: string): Promise<Harvested[]> {
  // famunity.net: React SPA, cards use .school-card/.school-name; loads more via .show-more-button.
  // No per-card URLs — evidence is startUrl. External website goes to notes (not providerUrl).
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Click "Show More" until all cards are loaded
  for (let i = 0; i < 30; i++) {
    const btn = await page.$(".show-more-button");
    if (!btn) break;
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) break;
    await btn.click();
    await new Promise((r) => setTimeout(r, 1500));
  }

  return page.evaluate((baseUrl: string) => {
    const out: { name: string; url: string; location?: string; dates?: string }[] = [];
    const seen = new Set<string>();
    document.querySelectorAll(".school-card").forEach((card) => {
      const name = card.querySelector(".school-name")?.textContent?.trim() || "";
      if (!name || name.length < 3) return;
      const website = (card.querySelector(".school-website-link") as HTMLAnchorElement | null)?.href || "";
      const allDetails = Array.from(card.querySelectorAll(".school-detail-row"));
      let location = "";
      let dates = "";
      for (const row of allDetails) {
        const label = row.querySelector(".school-detail-label")?.textContent?.trim()?.toLowerCase() || "";
        const value = (row.querySelector(".school-detail-value-with-flag,.school-detail-value") as HTMLElement | null)?.textContent?.trim() || "";
        if (label === "location") location = value;
        else if (label === "dates") dates = value;
      }
      // Use name+location as dedup key so same provider at different locations is separate
      const key = `${name}::${location}`;
      if (seen.has(key)) return;
      seen.add(key);
      // famunity has no per-card detail URLs; use provider website as evidence URL
      // (points the reviewer to the real source) or fall back to aggregator startUrl.
      // This stays in evidence[] — providerUrl is never set (aggregator-only rule).
      out.push({
        name: location ? `${name} (${location})` : name,
        url: website || baseUrl,
        location,
        dates: dates || undefined,
      });
    });
    return out;
  }, startUrl);
}

async function harvestWanderworks(page: import("puppeteer-core").Page, startUrl: string): Promise<Harvested[]> {
  // wanderworks.life: React SPA with base64 images (30MB+); use domcontentloaded + wait.
  // Camp links: a[href*='/camp/'], h3 = name, span.truncate = "City, Country" location.
  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch {
    // page may timeout due to base64 images but content is already loaded
  }
  await new Promise((r) => setTimeout(r, 5000));

  return page.evaluate(() => {
    const out: { name: string; url: string; location?: string; dates?: string }[] = [];
    const seen = new Set<string>();
    document.querySelectorAll("a[href*='/camp/']").forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (seen.has(href)) return;
      const h3 = a.querySelector("h3");
      const name = h3?.textContent?.trim() || "";
      if (!name || name.length < 3) return;
      const locationSpan = a.querySelector("span.truncate");
      const location = locationSpan?.textContent?.trim();
      seen.add(href);
      out.push({ name, url: href, location });
    });
    return out;
  });
}

async function harvest(page: import("puppeteer-core").Page, domain: string, startUrl: string): Promise<Harvested[]> {
  if (domain === "famunity.net") return harvestFamunity(page, startUrl);
  if (domain === "wanderworks.life") return harvestWanderworks(page, startUrl);
  // Generic fallback for future sites
  await page.goto(startUrl, { waitUntil: "networkidle2", timeout: 45_000 });
  await page.evaluate(async () => {
    for (let y = 0; y < 6; y++) { window.scrollBy(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 800)); }
  });
  return page.evaluate(() => {
    const out: { name: string; url: string; location?: string; dates?: string }[] = [];
    const seen = new Set<string>();
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!/\/(listing|hub|camp|trip|event|profile|p)\//i.test(href)) return;
      if (seen.has(href)) return;
      const card = a.closest("article,li,div");
      const heading = card?.querySelector("h1,h2,h3,h4")?.textContent?.trim()
        || (a as HTMLElement).textContent?.trim() || "";
      if (!heading || heading.length < 3) return;
      seen.add(href);
      out.push({ name: heading, url: href });
    });
    return out;
  });
}

async function main() {
  const rawConfig = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, SiteCfgMaybeUnsupported>;
  const dir = (JSON.parse(readFileSync(DIRJSON, "utf8")) as { id: string; name: string; country: string }[])
    .map((e): DirEntry => ({ id: e.id, name: e.name, country: e.country }));
  const inbox = loadInbox();
  const rejected = loadRejected();
  const inboxCids = new Set(inbox.candidates.map((c) => c.cid));

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  let added = 0;
  try {
    for (const [domain, rawCfg] of Object.entries(rawConfig)) {
      if (rawCfg.unsupported) {
        console.log(`${domain}: skipped — unsupported: ${rawCfg.unsupported}`);
        continue;
      }
      const cfg = rawCfg as SiteCfg;
      const page = await browser.newPage();
      try {
        const rows = await harvest(page, domain, cfg.startUrl);
        console.log(`${domain}: harvested ${rows.length} listing-like rows`);
        const now = new Date().toISOString();
        for (const r of rows) {
          if (isRejected(r.name, rejected)) continue;
          const verdict = dedupeVerdict(r.name, undefined, dir);
          if (verdict === "known") continue;
          const cid = candidateCid(r.name, cfg.sourceChannel);
          if (inboxCids.has(cid)) continue;
          const cand: InboxCandidate = {
            cid, name: r.name,
            evidence: [{ url: r.url, asOf: r.listingDate ?? now.slice(0, 10) }],
            sourceChannel: cfg.sourceChannel, dedupe: verdict, addedAt: now,
            categoryGuess: cfg.categoryGuess || undefined,
            listingDate: r.listingDate,
            region: r.location, claimedDates: r.dates,
            notes: `rendered from ${domain}`,
          };
          inbox.candidates.push(cand); inboxCids.add(cid); added++;
        }
        saveInbox(inbox);    // commit per site
      } catch (err) {
        console.warn(`${domain}: error — skipped`, err instanceof Error ? err.message : err);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`added ${added} new candidates → inbox (${inbox.candidates.length} total). Review: npm run inbox:review`);
}

main().catch((err) => { console.error(err); process.exit(1); });
