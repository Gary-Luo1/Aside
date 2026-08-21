import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureHostPermission,
  hasHostPermission,
  originPatternFromBaseUrl,
} from "../../src/shared/host-permission";

describe("originPatternFromBaseUrl", () => {
  it("从 https Base URL 生成 origin 匹配", () => {
    expect(originPatternFromBaseUrl("https://api.deepseek.com/v1")).toBe("https://api.deepseek.com/*");
  });

  it("保留端口", () => {
    expect(originPatternFromBaseUrl("http://127.0.0.1:8787/v1")).toBe("http://127.0.0.1:8787/*");
  });
});

describe("hasHostPermission / ensureHostPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("没有 chrome.permissions 时视为已授权（单测环境）", async () => {
    vi.stubGlobal("chrome", {});
    await expect(hasHostPermission("https://api.example.com/v1")).resolves.toBe(true);
    await expect(ensureHostPermission("https://api.example.com/v1")).resolves.toBe(true);
  });

  it("已授权时不再弹出申请", async () => {
    const request = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn(async () => true),
        request,
      },
    });
    await expect(ensureHostPermission("https://api.example.com/v1")).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("未授权时按 origin 申请", async () => {
    const request = vi.fn(async (opts: { origins: string[] }) => opts.origins[0] === "https://api.example.com/*");
    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn(async () => false),
        request,
      },
    });
    await expect(ensureHostPermission("https://api.example.com/v1")).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["https://api.example.com/*"] });
  });

  it("用户拒绝申请时返回 false", async () => {
    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn(async () => false),
        request: vi.fn(async () => false),
      },
    });
    await expect(ensureHostPermission("https://api.example.com/v1")).resolves.toBe(false);
  });
});
