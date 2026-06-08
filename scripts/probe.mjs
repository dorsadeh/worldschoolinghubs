import puppeteer from "puppeteer-core";

const URL = process.env.PROBE_URL || "http://localhost:3140";
const browser = await puppeteer.launch({
  executablePath: "/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("tile.openstreetmap")) logs.push(`[requestfailed] ${u} :: ${r.failure()?.errorText}`); });

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

const count = () => page.evaluate(() => Array.from(document.querySelectorAll("span")).map((s) => s.textContent).find((t) => /hub\(s\)/.test(t || "")) || null);
const clickByText = (re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const el = Array.from(document.querySelectorAll("button")).find((b) => rx.test(b.textContent || ""));
  if (el) { el.click(); return true; } return false;
}, re.source);

const map = await page.evaluate(() => ({
  loadingStuck: document.body.innerText.includes("Loading map"),
  container: !!document.querySelector(".leaflet-container"),
  tiles: document.querySelectorAll("img.leaflet-tile").length,
  pins: document.querySelectorAll(".ws-pin").length,
  clusters: document.querySelectorAll(".marker-cluster").length,
  legend: document.body.innerText.includes("Hub type"),
}));
console.log("=== MAP ===");
console.log(JSON.stringify(map, null, 2));

console.log("\n=== FILTERS ===");
const base = await count();
console.log("initial:", base);

await clickByText(/Permanent hub/);
await new Promise((r) => setTimeout(r, 400));
const afterType = await count();
console.log("after type=Permanent:", afterType, afterType !== base ? "OK" : "FAIL");
await clickByText(/Permanent hub/); // reset toggle
await new Promise((r) => setTimeout(r, 300));

await page.type('input[type="search"]', "lagos");
await new Promise((r) => setTimeout(r, 400));
const afterSearch = await count();
console.log("after search='lagos':", afterSearch, afterSearch !== base ? "OK" : "FAIL");
await clickByText(/Clear filters/);
await new Promise((r) => setTimeout(r, 300));
const afterClear = await count();
console.log("after Clear filters:", afterClear, afterClear === base ? "OK" : "FAIL");

const countries = await page.evaluate(() => Array.from(document.querySelectorAll("select option")).map((o) => o.value).filter(Boolean));
await page.select("select", countries[0]);
await new Promise((r) => setTimeout(r, 400));
const afterCountry = await count();
console.log(`after country='${countries[0]}':`, afterCountry, afterCountry !== base ? "OK" : "FAIL");
await clickByText(/Clear filters/);
await new Promise((r) => setTimeout(r, 300));

console.log("\n=== DETAIL PANEL ===");
const opened = await page.evaluate(() => {
  const item = document.querySelector("ul li button");
  if (item) { item.click(); return true; } return false;
});
await new Promise((r) => setTimeout(r, 500));
const detail = await page.evaluate(() => ({
  sourcesShown: document.body.innerText.includes("Sources"),
  hasCloseButton: !!Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "✕"),
}));
console.log("clicked list item:", opened, "| detail:", JSON.stringify(detail));

console.log("\n=== CONSOLE ERRORS/WARNINGS ===");
console.log(logs.length ? logs.join("\n") : "(none)");
await browser.close();
