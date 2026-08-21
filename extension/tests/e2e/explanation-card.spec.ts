import { expect } from "@playwright/test";
import { openExplanationCard, test } from "./helpers";
import {
  clickOverlayButton,
  expectOverlayButtonVisible,
  expectOverlayDialogText,
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
});
