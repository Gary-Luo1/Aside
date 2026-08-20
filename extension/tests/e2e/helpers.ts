import path from "node:path";
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from "@playwright/test";

export const EXTENSION_PATH = path.resolve(__dirname, "../../dist");
export const FAKE_API_BASE = "http://127.0.0.1:8787";

export interface ExtensionFixture {
  context: BrowserContext;
  extensionId: string;
}

export const test = base.extend<{ extension: ExtensionFixture }>({
  extension: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent("serviceworker");
    }
    const extensionId = new URL(worker.url()).host;
    await use({ context, extensionId });
    await context.close();
  },
});

export async function openOptionsPage(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator("#config-form")).toBeVisible();
  return page;
}

export async function configureAndSave(
  context: BrowserContext,
  extensionId: string,
  config: { baseUrl?: string; apiKey?: string; model?: string } = {},
): Promise<void> {
  const page = await openOptionsPage(context, extensionId);
  const baseUrl = config.baseUrl ?? `${FAKE_API_BASE}/v1`;
  const apiKey = config.apiKey ?? "sk-e2e-test-key";
  const model = config.model ?? "fake-model";

  await page.locator("#base-url").fill(baseUrl);
  await page.locator("#api-key").fill(apiKey);
  await page.locator("#model").fill(model);
  await page.locator("#test-connection").click();
  await expect(page.locator("#status")).toContainText("连接测试成功");
  await page.locator("#save").click();
  await expect(page.locator("#status")).toContainText("配置已保存");
  await page.close();
}

export async function openTutorialPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${FAKE_API_BASE}/tutorial.html`);
  await expect(page.locator("h1")).toContainText("HTTP API 教程");
  return page;
}

export async function openFramesPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${FAKE_API_BASE}/frames.html`);
  await expect(page.locator("h1")).toContainText("多帧教程页");
  await expect.poll(() => page.frames().filter((frame) => frame !== page.mainFrame()).length).toBeGreaterThanOrEqual(4);
  return page;
}

export async function getNamedFrame(page: Page, name: string): Promise<Frame> {
  const frame = page.frame({ name });
  expect(frame).not.toBeNull();
  if (!frame) throw new Error(`未找到 frame：${name}`);
  return frame;
}

/** 打开教程页、选中术语并等待解释卡片出现；configure 为 false 时跳过配置。 */
export async function openExplanationCard(
  context: BrowserContext,
  extensionId: string,
  viewport: { width: number; height: number },
  term: string,
  options: { configure?: boolean; settleMs?: number } = {},
): Promise<{ page: Page; dialog: Locator }> {
  if (options.configure !== false) {
    await configureAndSave(context, extensionId);
  }
  const page = await openTutorialPage(context);
  await page.setViewportSize(viewport);
  await selectText(page, term);
  await page.getByRole("button", { name: "解释这个词" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("专业解释");
  if (options.settleMs) {
    await page.waitForTimeout(options.settleMs);
  }
  return { page, dialog };
}

/** 用 Range 选中页面中的目标文本并触发 selectionchange。 */
export function selectText(page: Page, text: string): Promise<void> {
  return selectTextInFrame(page.mainFrame(), text);
}

export async function selectTextInFrame(frame: Frame, text: string): Promise<void> {
  const found = await frame.evaluate((target) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.nodeValue?.indexOf(target) ?? -1;
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      }
    }
    return false;
  }, text);
  expect(found).toBe(true);
  await frame.evaluate(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

export interface DragTarget {
  startText: string;
  endText: string;
}

export interface DragCoords {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface DragOptions {
  /** 在所有移动完成后、松开鼠标前执行；用于断言拖选中途的 UI 状态。 */
  onBeforeRelease?: () => Promise<void>;
}

/** 用真实鼠标拖选目标文本：按下 → 分步移动 → 松手。 */
export async function dragSelectText(
  page: Page,
  target: string | DragTarget,
  options: DragOptions = {},
): Promise<void> {
  await page.bringToFront();
  const startTarget = typeof target === "string" ? target : target.startText;
  const endTarget = typeof target === "string" ? target : target.endText;
  // 字符串目标需要把结束 Range 延伸到整个短语；DragTarget 只取结束词首字符
  const endLength = typeof target === "string" ? startTarget.length : 1;

  const coords = await page.evaluate(
    ({ startTarget, endTarget, endLength }) => {
      const findNode = (text: string): { node: Text; idx: number } | null => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const idx = node.nodeValue?.indexOf(text) ?? -1;
          if (idx >= 0) return { node: node as Text, idx };
        }
        return null;
      };
      const start = findNode(startTarget);
      const end = findNode(endTarget);
      if (!start || !end) return null;

      const startRange = document.createRange();
      startRange.setStart(start.node, start.idx);
      startRange.setEnd(start.node, start.idx + 1);
      const endRange = document.createRange();
      endRange.setStart(end.node, end.idx);
      endRange.setEnd(end.node, end.idx + endLength);
      const a = startRange.getBoundingClientRect();
      const b = endRange.getBoundingClientRect();
      return {
        startX: a.left + 1,
        startY: a.top + a.height / 2,
        endX: b.right - 1,
        endY: b.top + b.height / 2,
      };
    },
    { startTarget, endTarget, endLength },
  );
  expect(coords).not.toBeNull();
  if (!coords) throw new Error(`拖选目标未在页面中找到：${startTarget}`);

  await page.mouse.move(coords.startX, coords.startY);
  await page.waitForTimeout(20); // 让指针先稳定命中文本
  await page.mouse.down();
  await page.waitForTimeout(20); // 让 mousedown 完成命中后再开始拖动
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    const x = coords.startX + ((coords.endX - coords.startX) * i) / steps;
    const y = coords.startY + ((coords.endY - coords.startY) * i) / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
  if (options.onBeforeRelease) {
    await options.onBeforeRelease();
  }
  await page.mouse.up();
}

export async function resetFakeApi(): Promise<void> {
  await fetch(`${FAKE_API_BASE}/reset`);
}

export async function lastFakeApiRequest(): Promise<{
  lastRequest: Record<string, unknown> | null;
  requestCount: number;
}> {
  const response = await fetch(`${FAKE_API_BASE}/last-request`);
  return response.json() as Promise<{
    lastRequest: Record<string, unknown> | null;
    requestCount: number;
  }>;
}
