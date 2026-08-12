import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 2800 },
  deviceScaleFactor: 1,
});

await page.goto("file://" + path.join(dir, "preview.html"));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, "cards-preview.png"), fullPage: true });
await browser.close();
console.log("saved cards-preview.png");
