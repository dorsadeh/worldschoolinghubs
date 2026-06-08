import puppeteer from "puppeteer-core";
const URL = process.env.PROBE_URL || "http://localhost:3140";
const browser = await puppeteer.launch({
  executablePath: "/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

for (const vp of [{ w: 1280, h: 900, name: "desktop" }, { w: 390, h: 844, name: "mobile" }]) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000));
  const m = await page.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    const main = document.querySelector("main");
    const r = (el) => el ? { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) } : null;
    return {
      mainSize: r(main),
      mapSize: r(c),
      tiles: document.querySelectorAll("img.leaflet-tile").length,
      loadingStuck: document.body.innerText.includes("Loading map"),
      mapErrorShown: document.body.innerText.includes("The map failed to load"),
    };
  });
  console.log(`[${vp.name} ${vp.w}x${vp.h}]`, JSON.stringify(m), errs.length ? "ERRORS: " + errs.join(" | ") : "");
  await page.close();
}
await browser.close();
