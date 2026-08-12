import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });
await page.goto("file://" + path.join(dir, "cards.html"));
await page.waitForTimeout(200);

const report = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("section.card")];
  return cards.map((card, i) => {
    const inner = card.querySelector(".spacer")
      ? card.querySelector(".spacer")
      : card.firstElementChild;
    return {
      i: i + 1,
      scrollH: card.scrollHeight,
      clientH: card.clientHeight,
      scrollW: card.scrollWidth,
      clientW: card.clientWidth,
      overflow: card.scrollHeight > card.clientHeight,
      overflowX: card.scrollWidth > card.clientWidth,
    };
  });
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
