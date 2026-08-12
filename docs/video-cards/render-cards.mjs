import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, "cards.html");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1440 },
  deviceScaleFactor: 1,
});

await page.goto("file://" + htmlPath);
await page.waitForTimeout(300);

const cards = await page.locator("section.card").count();
for (let i = 0; i < cards; i++) {
  const name = `card-${String(i + 1).padStart(2, "0")}.png`;
  await page.locator("section.card").nth(i).screenshot({
    path: path.join(dir, name),
    type: "png",
  });
  console.log(`saved ${name}`);
}

await browser.close();
console.log(`done: ${cards} cards`);
