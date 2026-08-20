import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_STORAGE_KEY,
  deleteConfig,
  loadConfig,
  normalizeBaseUrl,
  restrictStorageAccessLevel,
  saveConfig,
  validateConfig,
} from "../../src/shared/config";
import type { AiConfig } from "../../src/shared/messages";

function makeStorageStub() {
  const data = new Map<string, unknown>();
  const setAccessLevel = vi.fn().mockResolvedValue(undefined);
  return {
    data,
    setAccessLevel,
    stub: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
        if (keys === undefined || keys === null) {
          return Object.fromEntries(data);
        }
        const wanted = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const key of wanted) {
          if (data.has(key)) result[key] = data.get(key);
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) data.set(key, value);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
      }),
      setAccessLevel,
    },
  };
}

const sampleConfig: AiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-secret",
  model: "gpt-4o",
};

describe("normalizeBaseUrl", () => {
  it("接受 https 地址并保留", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1");
  });

  it("去除尾斜杠", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
  });

  it("接受本地调试的 http localhost", () => {
    expect(normalizeBaseUrl("http://localhost:8000/v1")).toBe("http://localhost:8000/v1");
    expect(normalizeBaseUrl("http://127.0.0.1:8000/v1")).toBe("http://127.0.0.1:8000/v1");
  });

  it("拒绝非本地 http 地址", () => {
    expect(normalizeBaseUrl("http://example.com/v1")).toBeNull();
  });

  it("拒绝非 http(s) 协议", () => {
    expect(normalizeBaseUrl("ftp://example.com/v1")).toBeNull();
  });

  it("拒绝无法解析的地址", () => {
    expect(normalizeBaseUrl("not a url")).toBeNull();
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl(undefined)).toBeNull();
  });

  it("拒绝带 query 或 hash 的地址", () => {
    expect(normalizeBaseUrl("https://api.example.com/v1?foo=bar")).toBeNull();
    expect(normalizeBaseUrl("https://api.example.com/v1#section")).toBeNull();
  });
});

describe("validateConfig", () => {
  it("接受完整配置并规范化", () => {
    const result = validateConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: " sk-test-123 ",
      model: " gpt-4o ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123",
        model: "gpt-4o",
        restoreSelection: true,
      });
    }
  });

  it("读取配置时始终开启恢复划词，忽略旧开关值", () => {
    const off = validateConfig({
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "m",
      restoreSelection: false,
    });
    expect(off.ok && off.config.restoreSelection).toBe(true);
  });

  it("拒绝缺少必填字段", () => {
    expect(validateConfig({ apiKey: "k", model: "m" }).ok).toBe(false);
    expect(validateConfig({ baseUrl: "https://x.com", model: "m" }).ok).toBe(false);
    expect(validateConfig({ baseUrl: "https://x.com", apiKey: "k" }).ok).toBe(false);
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig("x").ok).toBe(false);
  });

  it("拒绝无效 URL", () => {
    expect(validateConfig({ baseUrl: "http://x.com", apiKey: "k", model: "m" }).ok).toBe(false);
  });
});

describe("配置读取（loadConfig）", () => {
  let storage: ReturnType<typeof makeStorageStub>;

  beforeEach(() => {
    storage = makeStorageStub();
    vi.stubGlobal("chrome", { storage: { local: storage.stub } });
  });

  it("未保存时返回 absent", async () => {
    await expect(loadConfig()).resolves.toEqual({ ok: false, reason: "absent" });
  });

  it("读取已保存的合法配置并完成规范化", async () => {
    storage.data.set(CONFIG_STORAGE_KEY, {
      baseUrl: "https://api.example.com/v1/",
      apiKey: " sk-secret ",
      model: " gpt-4o ",
    });
    await expect(loadConfig()).resolves.toEqual({
      ok: true,
      config: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
        model: "gpt-4o",
        restoreSelection: true,
      },
    });
  });

  it("存储损坏（缺字段）返回 invalid 且带用户可读消息，而非 absent", async () => {
    storage.data.set(CONFIG_STORAGE_KEY, { baseUrl: "https://x.com" });
    await expect(loadConfig()).resolves.toEqual({
      ok: false,
      reason: "invalid",
      message: "API Key 不能为空。",
    });
  });

  it("存储被篡改（非本地 http 地址）返回 invalid 并说明 Base URL", async () => {
    storage.data.set(CONFIG_STORAGE_KEY, {
      baseUrl: "http://evil.example.com/v1",
      apiKey: "k",
      model: "m",
    });
    const result = await loadConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
      expect(result.message).toContain("Base URL");
    }
  });

  it("恢复划词字段缺失或为旧值时统一规范化为 true", async () => {
    storage.data.set(CONFIG_STORAGE_KEY, sampleConfig);
    const result = await loadConfig();
    expect(result.ok && result.config.restoreSelection).toBe(true);

    storage.data.set(CONFIG_STORAGE_KEY, { ...sampleConfig, restoreSelection: false });
    const coerced = await loadConfig();
    expect(coerced.ok).toBe(true);
    if (coerced.ok) expect(coerced.config.restoreSelection).toBe(true);
  });
});

describe("配置写入（saveConfig / deleteConfig）", () => {
  let storage: ReturnType<typeof makeStorageStub>;

  beforeEach(() => {
    storage = makeStorageStub();
    vi.stubGlobal("chrome", { storage: { local: storage.stub } });
  });

  it("保存前校验并规范化，落盘为规范化后的配置", async () => {
    await saveConfig({
      baseUrl: "https://api.example.com/v1/",
      apiKey: " k ",
      model: " m ",
    });
    const normalized = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "m",
      restoreSelection: true,
    };
    expect(storage.stub.set).toHaveBeenCalledWith({ [CONFIG_STORAGE_KEY]: normalized });
    expect(storage.data.get(CONFIG_STORAGE_KEY)).toEqual(normalized);
  });

  it("拒绝非法配置：抛错且不落盘", async () => {
    await expect(
      saveConfig({ baseUrl: "http://evil.example.com/v1", apiKey: "k", model: "m" }),
    ).rejects.toThrow();
    expect(storage.data.has(CONFIG_STORAGE_KEY)).toBe(false);
  });

  it("删除后配置不存在", async () => {
    storage.data.set(CONFIG_STORAGE_KEY, sampleConfig);
    await deleteConfig();
    expect(storage.data.has(CONFIG_STORAGE_KEY)).toBe(false);
    await expect(loadConfig()).resolves.toEqual({ ok: false, reason: "absent" });
  });
});

describe("restrictStorageAccessLevel", () => {
  let storage: ReturnType<typeof makeStorageStub>;

  beforeEach(() => {
    storage = makeStorageStub();
    vi.stubGlobal("chrome", { storage: { local: storage.stub } });
  });

  it("将访问级别限制为受信任上下文", async () => {
    await restrictStorageAccessLevel();
    expect(storage.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
  });

  it("平台不支持 setAccessLevel 时不抛错", async () => {
    storage.stub.setAccessLevel = undefined as never;
    await expect(restrictStorageAccessLevel()).resolves.toBeUndefined();
  });

  it("setAccessLevel 失败时降级不抛错", async () => {
    storage.setAccessLevel.mockRejectedValue(new Error("unsupported"));
    await expect(restrictStorageAccessLevel()).resolves.toBeUndefined();
  });
});
