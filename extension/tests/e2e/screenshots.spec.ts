import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import {
  FAKE_API_BASE,
  configureAndSave,
  openExplanationCard,
  openOptionsPage,
  openTutorialPage,
  selectText,
  test,
} from "./helpers";

const OUT_DIR = path.resolve(__dirname, "../../../docs/visual-evidence");

test.describe("视觉证据", () => {
  test.beforeAll(async () => {
    await mkdir(OUT_DIR, { recursive: true });
  });

  test("设置页 1280×720 初始空态", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "options-1280x720-empty.png") });
  });

  test("设置页 1280×720 已配置态", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator("#base-url").fill(`${FAKE_API_BASE}/v1`);
    await page.locator("#api-key").fill("sk-e2e");
    await page.locator("#model").fill("fake-model");
    await page.locator("#test-connection").click();
    await expect(page.locator("#status")).toContainText("连接测试成功");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("配置已保存");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "options-1280x720-configured.png") });
  });

  test("设置页 480×860 窄屏空态", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.setViewportSize({ width: 480, height: 860 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "options-480x860-narrow.png") });
  });

  test("1440×900 正文中部选词，双栏成功态", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "算法",
      { settleMs: 250 },
    );
    await page.screenshot({ path: path.join(OUT_DIR, "1440x900-success.png") });
  });

  test("768×900 靠右选词，卡片位置适配", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 768, height: 900 },
      "许可证公开",
      { settleMs: 250 },
    );
    await page.screenshot({ path: path.join(OUT_DIR, "768x900-position.png") });
  });

  test("600×900 窄屏纵向排列并展开", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 600, height: 900 },
      "云计算",
      { settleMs: 250 },
    );
    const expand = page.getByRole("button", { name: "展开完整解释" });
    if (await expand.isVisible()) {
      await expand.click();
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: path.join(OUT_DIR, "600x900-narrow-expanded.png") });
  });

  test("未配置态截图", async ({ extension }) => {
    const page = await openTutorialPage(extension.context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await selectText(page, "API");
    await page.getByRole("button", { name: "解释这个词" }).click();
    await expect(page.getByRole("dialog")).toContainText("尚未配置 AI 接口");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "unconfigured.png") });
  });

  test("错误态截图", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    await fetch(`${FAKE_API_BASE}/set-next-status?code=429`);
    const page = await openTutorialPage(extension.context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await selectText(page, "API");
    await page.getByRole("button", { name: "解释这个词" }).click();
    await expect(page.getByRole("dialog")).toContainText("429");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT_DIR, "error.png") });
  });
});
