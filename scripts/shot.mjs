import puppeteer from "puppeteer-core";
const URL = process.env.PROBE_URL || "http://localhost:3140";
const browser = await puppeteer.launch({
  executablePath: "/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: "/tmp/ws_map.png" });

// open detail on a hub that has rich data (find by name in list)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("ul li button")).find((b) => /Deliberate Detour/.test(b.textContent || ""))
    || document.querySelector("ul li button");
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: "/tmp/ws_detail.png" });
const sources = await page.evaluate(() => document.body.innerText.includes("Sources"));
console.log("Sources visible after opening detail:", sources);
await browser.close();
