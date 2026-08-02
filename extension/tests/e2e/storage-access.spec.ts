import { expect } from "@playwright/test";
import { configureAndSave, openTutorialPage, test } from "./helpers";

test.describe("密钥隔离", () => {
  test("content script 无法读取 storage.local，后台可读", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const page = await openTutorialPage(extension.context);

    const session = await extension.context.newCDPSession(page);
    await session.send("Runtime.enable");
    const contexts: Array<{ id: number; origin: string }> = [];
    session.on("Runtime.executionContextCreated", ({ context }) => {
      contexts.push(context);
    });
    await page.reload();

    await expect
      .poll(() => contexts.some((c) => c.origin.startsWith("chrome-extension://")))
      .toBe(true);

    let contentScriptResult: { ok: boolean; error?: string } | null = null;
    for (const c of contexts) {
      if (!c.origin.startsWith("chrome-extension://")) continue;
      const r = await session.send("Runtime.evaluate", {
        expression:
          "chrome.storage.local.get('aiConfig').then(v => ({ok:true})).catch(e => ({ok:false, error:String(e)}))",
        contextId: c.id,
        awaitPromise: true,
        returnByValue: true,
      });
      contentScriptResult = r.result?.value as { ok: boolean; error?: string };
    }

    expect(contentScriptResult).not.toBeNull();
    expect(contentScriptResult?.ok).toBe(false);
    expect(contentScriptResult?.error).toContain("not allowed");

    const worker = extension.context.serviceWorkers()[0];
    expect(worker).toBeTruthy();
    const trusted = await worker!.evaluate(async () => {
      const value = await chrome.storage.local.get("aiConfig");
      return { hasKey: Boolean(value.aiConfig) };
    });
    expect(trusted.hasKey).toBe(true);
  });
});
