import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1440 },
  deviceScaleFactor: 1,
});

await page.goto("file://" + path.join(dir, "cover.html"));
await page.waitForTimeout(300);
await page.locator("section.cover").screenshot({
  path: path.join(dir, "cover.png"),
  type: "png",
});
await browser.close();
console.log("saved cover.png");
