import puppeteer from "puppeteer-core";
const URL = process.env.PROBE_URL || "http://localhost:3000";
const browser = await puppeteer.launch({
  executablePath: "/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 4500));
await page.screenshot({ path: "/tmp/ws_dir_full.png" });

// Open the first card's modal
await page.evaluate(() => {
  const card = document.querySelector("button.group");
  card?.click();
});
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: "/tmp/ws_dir_modal.png" });

const counts = await page.evaluate(() => ({
  cards: document.querySelectorAll("button.group").length,
  brand: document.body.innerText.includes("Worldschool Atlas"),
  refs: document.body.innerText.includes("References"),
}));
console.log(JSON.stringify(counts));
await browser.close();
