import { expect } from "@playwright/test";
import { lastFakeApiRequest, openExplanationCard, resetFakeApi, test } from "./helpers";
import {
  clickOverlayButton,
  dragSelectOverlayBodyText,
  expectOverlayButtonVisible,
  expectOverlayDialogHidden,
  expectOverlayDialogText,
  expectOverlayDialogVisible,
  focusOverlayButton,
  overlayButtonBox,
  overlayDialogBox,
  overlayDialogEvaluate,
} from "./overlay-cdp";

test.describe("B 双栏解释卡片", () => {
  test("宽屏双栏：专业解释在左、通俗解释在右", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "API",
    );

    const columnCount = await overlayDialogEvaluate(page, (el) => {
      const columns = el.querySelector(".columns");
      if (!columns) return 0;
      const template = getComputedStyle(columns).gridTemplateColumns;
      return template.split(" ").length;
    });
    expect(columnCount).toBe(2);

    const order = await overlayDialogEvaluate(page, (el) => {
      const headings = [...el.querySelectorAll(".col h3")].map((h) => h.textContent);
      return headings;
    });
    expect(order).toEqual(["专业解释", "通俗解释"]);
  });

  test("窄屏纵向排列", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 600, height: 900 },
      "API",
    );

    const columnCount = await overlayDialogEvaluate(page, (el) => {
      const columns = el.querySelector(".columns");
      if (!columns) return 0;
      const template = getComputedStyle(columns).gridTemplateColumns;
      return template.split(" ").length;
    });
    expect(columnCount).toBe(1);
  });

  test("长文本显示展开按钮，展开后可见完整内容", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "云计算",
    );

    await expectOverlayButtonVisible(page, "展开完整解释");
    await clickOverlayButton(page, "展开完整解释");
    await expectOverlayDialogText(page, "补充说明");
    await expectOverlayButtonVisible(page, "收起解释");
  });

  test("卡片不横向溢出视口", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "API",
    );

    const box = await overlayDialogBox(page);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  });

  test("解释正文里再划词可继续解释", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "算法",
    );

    await expectOverlayDialogText(page, "一组明确约定");
    await dragSelectOverlayBodyText(page, "约定");

    await expectOverlayDialogVisible(page);
    await expectOverlayButtonVisible(page, "解释这个词");
    await clickOverlayButton(page, "解释这个词");
    await expectOverlayDialogText(page, "“约定”");
    await expectOverlayDialogText(page, "约定 的专业解释");
  });

  test("解释正文划词后点关闭或展开不会发起新解释", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "云计算",
    );

    await expectOverlayButtonVisible(page, "展开完整解释");
    await resetFakeApi();
    await dragSelectOverlayBodyText(page, "网络");
    await expectOverlayButtonVisible(page, "解释这个词");

    const followup = await overlayButtonBox(page, "解释这个词");
    const expand = await overlayButtonBox(page, "展开完整解释");
    const close = await overlayButtonBox(page, "关闭解释卡片");
    expect(followup).not.toBeNull();
    expect(boxesOverlap(followup, expand)).toBe(false);
    expect(boxesOverlap(followup, close)).toBe(false);

    await clickOverlayButton(page, "展开完整解释");
    await expectOverlayDialogText(page, "“云计算”");
    await expectOverlayButtonVisible(page, "收起解释");
    expect((await lastFakeApiRequest()).requestCount).toBe(0);

    await clickOverlayButton(page, "关闭解释卡片");
    await expectOverlayDialogHidden(page);
    expect((await lastFakeApiRequest()).requestCount).toBe(0);
  });

  test("解释正文划词后键盘激活关闭或展开不会发起新解释", async ({ extension }) => {
    const { page } = await openExplanationCard(
      extension.context,
      extension.extensionId,
      { width: 1440, height: 900 },
      "云计算",
    );

    await expectOverlayButtonVisible(page, "展开完整解释");
    await resetFakeApi();
    await dragSelectOverlayBodyText(page, "网络");
    await expectOverlayButtonVisible(page, "解释这个词");

    await focusOverlayButton(page, "展开完整解释");
    await page.keyboard.press("Enter");
    await expectOverlayDialogText(page, "“云计算”");
    await expectOverlayButtonVisible(page, "收起解释");
    expect((await lastFakeApiRequest()).requestCount).toBe(0);

    await focusOverlayButton(page, "关闭解释卡片");
    await page.keyboard.press("Enter");
    await expectOverlayDialogHidden(page);
    expect((await lastFakeApiRequest()).requestCount).toBe(0);
  });
});

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): boolean {
  if (!a || !b) return false;
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}
