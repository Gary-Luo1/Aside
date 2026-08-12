import { expect } from "@playwright/test";
import {
  FAKE_API_BASE,
  configureAndSave,
  lastFakeApiRequest,
  openOptionsPage,
  resetFakeApi,
  test,
} from "./helpers";

test.describe("设置页", () => {
  test("初始状态：保存禁用、删除隐藏", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await expect(page.locator("#save")).toBeDisabled();
    await expect(page.locator("#delete-config")).toBeHidden();
  });

  test("完整配置流程：测试成功→保存→修改后重新禁用→删除", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.locator("#base-url").fill(`${FAKE_API_BASE}/v1`);
    await page.locator("#api-key").fill("sk-e2e");
    await page.locator("#model").fill("fake-model");
    await expect(page.locator("#save")).toBeDisabled();

    await page.locator("#test-connection").click();
    await expect(page.locator("#status")).toContainText("连接测试成功");
    await expect(page.locator("#save")).toBeEnabled();

    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("配置已保存");
    await expect(page.locator("#delete-config")).toBeVisible();

    await page.locator("#model").fill("another-model");
    await expect(page.locator("#save")).toBeDisabled();

    await page.locator("#delete-config").click();
    await expect(page.locator("#status")).toContainText("已删除");
    await expect(page.locator("#base-url")).toHaveValue("");
    await expect(page.locator("#api-key")).toHaveValue("");
    await expect(page.locator("#model")).toHaveValue("");
    await expect(page.locator("#delete-config")).toBeHidden();
  });

  test("API Key 默认掩码并可切换显示", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    const keyInput = page.locator("#api-key");
    await expect(keyInput).toHaveAttribute("type", "password");
    await page.locator("#toggle-key").click();
    await expect(keyInput).toHaveAttribute("type", "text");
    await page.locator("#toggle-key").click();
    await expect(keyInput).toHaveAttribute("type", "password");
  });

  test("鉴权失败显示可理解错误且不能保存", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.locator("#base-url").fill(`${FAKE_API_BASE}/v1`);
    await page.locator("#api-key").fill("sk-401");
    await page.locator("#model").fill("fake-model");
    await page.locator("#test-connection").click();
    await expect(page.locator("#status")).toContainText("401/403");
    await expect(page.locator("#save")).toBeDisabled();
  });

  test("非 https 非本地地址被本地校验拒绝", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await page.locator("#base-url").fill("http://example.com/v1");
    await page.locator("#api-key").fill("sk");
    await page.locator("#model").fill("fake-model");
    await page.locator("#test-connection").click();
    await expect(page.locator("#status")).toContainText("Base URL 无效");
    await expect(page.locator("#save")).toBeDisabled();
  });

  test("恢复划词开关可勾选、随配置保存并随删除重置", async ({ extension }) => {
    const page = await openOptionsPage(extension.context, extension.extensionId);
    await expect(page.locator("#restore-selection")).not.toBeChecked();

    await page.locator("#base-url").fill(`${FAKE_API_BASE}/v1`);
    await page.locator("#api-key").fill("sk-e2e");
    await page.locator("#model").fill("fake-model");
    await page.locator("#restore-selection").check();
    await page.locator("#test-connection").click();
    await expect(page.locator("#status")).toContainText("连接测试成功");
    await page.locator("#save").click();
    await expect(page.locator("#status")).toContainText("请刷新已打开的网页");
    await page.close();

    const reopened = await openOptionsPage(extension.context, extension.extensionId);
    await expect(reopened.locator("#restore-selection")).toBeChecked();

    await reopened.locator("#delete-config").click();
    await expect(reopened.locator("#status")).toContainText("已删除");
    await expect(reopened.locator("#restore-selection")).not.toBeChecked();
  });

  test("已保存配置只切换恢复划词时无需重新测试连接", async ({ extension }) => {
    await configureAndSave(extension.context, extension.extensionId);
    const reopened = await openOptionsPage(extension.context, extension.extensionId);
    await expect(reopened.locator("#status")).toContainText("Base URL、API Key 或 Model");
    await resetFakeApi();

    await reopened.locator("#restore-selection").check();
    await expect(reopened.locator("#save")).toBeEnabled();
    await reopened.locator("#save").click();
    await expect(reopened.locator("#status")).toContainText("请刷新已打开的网页");

    const { requestCount } = await lastFakeApiRequest();
    expect(requestCount).toBe(0);
    await reopened.close();

    const verified = await openOptionsPage(extension.context, extension.extensionId);
    await expect(verified.locator("#restore-selection")).toBeChecked();

    await verified.locator("#restore-selection").uncheck();
    await expect(verified.locator("#save")).toBeEnabled();
    await verified.locator("#save").click();
    await expect(verified.locator("#status")).toContainText("请刷新已打开的网页");
    await verified.close();

    const disabled = await openOptionsPage(extension.context, extension.extensionId);
    await expect(disabled.locator("#restore-selection")).not.toBeChecked();
  });
});
