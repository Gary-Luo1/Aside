import { expect } from "@playwright/test";
import {
  FAKE_API_BASE,
  configureAndSave,
  dragSelectText,
  getNamedFrame,
  lastFakeApiRequest,
  openFramesPage,
  openTutorialPage,
  resetFakeApi,
  selectText,
  selectTextInFrame,
  test,
} from "./helpers";

test.describe("选词解释流程", () => {
  test.beforeEach(async () => {
    await resetFakeApi();
  });

  test("配置后选中名词→解释入口→双栏卡片→关闭", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("专业解释");
    await expect(dialog).toContainText("通俗解释");
    await expect(dialog).toContainText("AI 生成内容可能不准确");

    const { lastRequest } = await lastFakeApiRequest();
    const messages = lastRequest?.messages as Array<{ role: string; content: string }> | undefined;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages?.[1]).toMatchObject({ role: "user", content: "请解释术语：算法" });
    const serialized = JSON.stringify(lastRequest);
    expect(serialized).not.toContain("tutorial");
    expect(serialized).not.toContain("HTTP API");
    expect(serialized).not.toContain("示例教程");
    expect(serialized).not.toContain("127.0.0.1");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("h1")).toContainText("HTTP API 教程");
    await expect(page.locator("p").first()).toContainText("API（应用程序编程接口）");
  });

  test("未点击解释前不发送任何请求", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);
    await resetFakeApi();

    await selectText(page, "数据库");
    await expect(page.getByRole("button", { name: "解释这个词" })).toBeVisible();
    await page.waitForTimeout(600);

    const { requestCount } = await lastFakeApiRequest();
    expect(requestCount).toBe(0);
  });

  test("划词后入口不抢焦点且入口保持紧凑", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await page.evaluate(() => {
      const focusTarget = document.createElement("button");
      focusTarget.id = "page-focus-target";
      focusTarget.textContent = "页面焦点";
      document.body.appendChild(focusTarget);
      focusTarget.focus();
    });
    await selectText(page, "算法");

    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await expect
      .poll(() => page.locator("#page-focus-target").evaluate((element) => element === document.activeElement))
      .toBe(true);

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox!.height).toBeLessThanOrEqual(36);
    const selectionBox = await page.evaluate(() => {
      const range = window.getSelection()?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
    });
    expect(selectionBox).not.toBeNull();
    expect(
      triggerBox!.x + triggerBox!.width <= selectionBox!.left ||
        triggerBox!.x >= selectionBox!.right ||
        triggerBox!.y + triggerBox!.height <= selectionBox!.top ||
        triggerBox!.y >= selectionBox!.bottom,
    ).toBe(true);
  });

  test("被动入口仍可通过键盘激活", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("专业解释");
  });

  test("入口可见时页面复制事件仍可收到选区", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await page.evaluate(() => {
      document.addEventListener(
        "copy",
        (event) => {
          (window as unknown as { __copyProbe?: unknown }).__copyProbe = {
            selectedText: window.getSelection()?.toString() ?? "",
          };
          event.preventDefault();
        },
        { capture: true, once: true },
      );
    });
    await selectText(page, "算法");
    await expect(page.getByRole("button", { name: "解释这个词" })).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __copyProbe?: { selectedText: string } }).__copyProbe))
      .toEqual({ selectedText: "算法" });
  });

  test("入口可见时右键事件仍由页面收到", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await page.evaluate(() => {
      document.addEventListener(
        "contextmenu",
        (event) => {
          (window as unknown as { __contextMenuProbe?: boolean }).__contextMenuProbe = true;
          event.preventDefault();
        },
        { capture: true, once: true },
      );
    });
    await selectText(page, "算法");
    await expect(page.getByRole("button", { name: "解释这个词" })).toBeVisible();
    await page.mouse.click(900, 600, { button: "right" });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __contextMenuProbe?: boolean }).__contextMenuProbe))
      .toBe(true);
  });

  test("选区滚出视口后被动入口关闭", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);
    await page.setViewportSize({ width: 800, height: 300 });

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect(trigger).toHaveCount(0);
  });

  test("未配置时点击解释提示打开设置", async ({ extension }) => {
    const page = await openTutorialPage(extension.context);
    await selectText(page, "API");
    await page.getByRole("button", { name: "解释这个词" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("尚未配置 AI 接口");
    await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
  });

  test("模型服务临时 401 显示可理解错误并可关闭", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    await fetch(`${FAKE_API_BASE}/set-next-status?code=401`);
    const page = await openTutorialPage(extension.context);
    await selectText(page, "API");
    await page.getByRole("button", { name: "解释这个词" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("401/403");
    await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("切换选词会取消旧结果并显示新入口", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "API");
    await page.getByRole("button", { name: "解释这个词" }).click();
    await expect(page.getByRole("dialog")).toContainText("专业解释");

    await selectText(page, "数据库");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("关闭加载中的卡片后，慢请求完成不重新弹出", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "缓存");
    await page.getByRole("button", { name: "解释这个词" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.mouse.click(1400, 60); // 点击页面空白关闭
    await page.waitForTimeout(200);
    expect(await page.getByRole("dialog").count()).toBe(0);

    await page.waitForTimeout(1800); // 等慢请求完成
    expect(await page.getByRole("dialog").count()).toBe(0);
  });

  test("解释中切换选词：新词结果覆盖，旧慢请求不覆盖", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "缓存");
    await page.getByRole("button", { name: "解释这个词" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await selectText(page, "算法");
    await page.getByRole("button", { name: "解释这个词" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("算法 的专业解释");
    await page.waitForTimeout(1600); // 旧慢请求本应已中止
    await expect(dialog).toContainText("算法 的专业解释");
    expect(await dialog.textContent()).not.toContain("缓存");
  });

  test("真实鼠标拖选：拖拽中不出现入口，松手后按完整选区显示", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    const phrase = "API（应用程序编程接口）是一组约定";
    await dragSelectText(page, phrase, {
      onBeforeRelease: async () => {
        // 松手前拖选尚未完成，入口不应出现。
        // 注意：不能在此处使用轮询式 expect(locator)，鼠标按住时轮询 DOM
        // 会干扰浏览器拖选；用一次瞬时 evaluate 检查。
        const count = await page.evaluate(
          () =>
            document.querySelector("#i-am-fine-overlay")?.shadowRoot?.querySelectorAll(".trigger")
              .length ?? 0,
        );
        expect(count).toBe(0);
      },
    });

    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("专业解释");

    const { lastRequest } = await lastFakeApiRequest();
    const messages = lastRequest?.messages as Array<{ role: string; content: string }> | undefined;
    expect(messages?.[1]).toMatchObject({ role: "user", content: `请解释术语：${phrase}` });
  });

  test("非鼠标拖选（键盘类选词）路径仍显示解释入口", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    // 本机 headful Chrome 无法由 Playwright/CDP 驱动光标方向键（实测箭头键不移动光标，
    // 与扩展无关），因此用 Range + selectionchange 模拟非鼠标拖选的键盘路径；
    // 该路径与既有 selectText 相同，正是修复需要保持不回退的 selectionchange 分支。
    await selectText(page, "算法");

    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("dialog")).toContainText(`专业解释`);
  });

  test("跨段落拖选（含换行）松手后显示短名词提示而不显示入口", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await dragSelectText(page, {
      startText: "API（应用程序编程接口）",
      endText: "数据库是存储",
    });

    await expect(page.getByText("请选择一个短名词（1–60 字，不含换行）")).toBeVisible();
    await expect(page.getByRole("button", { name: "解释这个词" })).toHaveCount(0);
  });

  test("超过 60 字的选词显示短名词提示且不发送请求", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);
    await resetFakeApi();

    const longPhrase =
      "数据库连接池是一种在应用启动时预先创建并维护一组数据库连接对象的机制，用于在请求期间复用连接以减少频繁建立和销毁连接的开销，同时需要处理连接数量限制与超时回收问题。";
    await selectText(page, longPhrase);

    await expect(page.getByText("请选择一个短名词（1–60 字，不含换行）")).toBeVisible();
    await expect(page.getByRole("button", { name: "解释这个词" })).toHaveCount(0);
    await page.waitForTimeout(600);
    const { requestCount } = await lastFakeApiRequest();
    expect(requestCount).toBe(0);
  });

  test("拖选过程中窗口失焦（拖出窗口松手）仍显示解释入口", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    let triggerAfterBlur = false;
    await dragSelectText(page, "API（应用程序编程接口）是一组约定", {
      onBeforeRelease: async () => {
        // 模拟拖选期间窗口失焦（不松鼠标）；应触发 blur 兜底并按当前选区显示入口
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.waitForTimeout(50);
        triggerAfterBlur =
          (await page.getByRole("button", { name: "解释这个词" }).count()) === 1;
      },
    });
    expect(triggerAfterBlur).toBe(true);
    await expect(page.getByRole("button", { name: "解释这个词" })).toBeVisible();
  });

  test("受保护页面：禁止选择时仍可划词并解释", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await extension.context.newPage();
    await page.goto(`${FAKE_API_BASE}/protected.html`);
    await expect(page.locator("h1")).toContainText("受保护教程页");

    await page.locator("#protected-action").click();
    await expect(page.locator("#protected-action")).toHaveAttribute("data-clicked", "true");

    await dragSelectText(page, "加密");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("dialog")).toContainText("专业解释");
  });

  test("点击入口时页面清空选区（飞书编辑器行为）仍能触发解释", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await extension.context.newPage();
    await page.goto(`${FAKE_API_BASE}/editor.html`);
    await expect(page.locator("h1")).toContainText("编辑器风格页面");

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("dialog")).toContainText(`专业解释`);
  });

  test("页面在 document 捕获阶段拦截点击仍能触发解释", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await extension.context.newPage();
    await page.goto(`${FAKE_API_BASE}/capture-stop.html`);
    await expect(page.locator("h1")).toContainText("事件拦截页面");

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("dialog")).toContainText(`专业解释`);
  });

  test("页面移除宿主节点后入口自动恢复挂载并可点击", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    await selectText(page, "算法");
    const trigger = page.getByRole("button", { name: "解释这个词" });
    await expect(trigger).toBeVisible();

    await page.evaluate(() => document.querySelector("#i-am-fine-overlay")?.remove());
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("dialog")).toContainText(`专业解释`);
  });

  test("HTTP/HTTPS 同源与跨源 frame 都能划词解释，特殊来源 frame 不注入", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openFramesPage(extension.context);
    const sameFrame = await getNamedFrame(page, "same-origin-frame");
    const crossFrame = await getNamedFrame(page, "cross-origin-frame");
    const dataFrame = await getNamedFrame(page, "data-frame");

    await selectTextInFrame(sameFrame, "算法");
    const sameTrigger = sameFrame.getByRole("button", { name: "解释这个词" });
    await expect(sameTrigger).toBeVisible();
    await sameTrigger.click();
    await expect(sameFrame.getByRole("dialog")).toContainText("专业解释");

    await selectTextInFrame(crossFrame, "算法");
    const crossTrigger = crossFrame.getByRole("button", { name: "解释这个词" });
    await expect(crossTrigger).toBeVisible();
    await crossTrigger.click();
    await expect(crossFrame.getByRole("dialog")).toContainText("专业解释");

    await expect(dataFrame.getByRole("button", { name: "解释这个词" })).toHaveCount(0);
  });

  test("不同 frame 的请求互不取消，且请求只包含选中术语", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    await resetFakeApi();
    const page = await openFramesPage(extension.context);
    const sameFrame = await getNamedFrame(page, "same-origin-frame");
    const crossFrame = await getNamedFrame(page, "cross-origin-frame");

    await selectTextInFrame(sameFrame, "缓存");
    await sameFrame.getByRole("button", { name: "解释这个词" }).click();

    await selectTextInFrame(crossFrame, "算法");
    await crossFrame.getByRole("button", { name: "解释这个词" }).click();

    await expect(crossFrame.getByRole("dialog")).toContainText("算法 的专业解释");
    await expect(sameFrame.getByRole("dialog")).toContainText("缓存的慢响应定义");

    const { requestCount, lastRequest } = await lastFakeApiRequest();
    expect(requestCount).toBe(2);
    const serialized = JSON.stringify(lastRequest);
    expect(serialized).not.toContain("多帧教程页");
    expect(serialized).not.toContain("嵌入教程帧");
    expect(serialized).not.toContain("frame");
  });

  test("嵌套 frame 每个文档只初始化一个入口宿主", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openFramesPage(extension.context);
    const nestedFrame = await getNamedFrame(page, "nested-frame");
    const innerFrame = await getNamedFrame(page, "nested-inner-frame");

    await expect
      .poll(() => nestedFrame.locator("#i-am-fine-overlay").count())
      .toBe(1);
    await expect
      .poll(() => innerFrame.locator("#i-am-fine-overlay").count())
      .toBe(1);

    await selectTextInFrame(innerFrame, "算法");
    await expect(innerFrame.getByRole("button", { name: "解释这个词" })).toBeVisible();
  });
});
