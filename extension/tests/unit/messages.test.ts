import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isConfigTestRequest,
  isConfigTestResult,
  isExplainResult,
  isExplainTermRequest,
  requestExplainTerm,
} from "../../src/shared/messages";

describe("载荷守卫", () => {
  it("isExplainTermRequest 接受合法请求", () => {
    expect(isExplainTermRequest({ type: "EXPLAIN_TERM_REQUEST", term: "API" })).toBe(true);
  });

  it("isExplainTermRequest 拒绝缺 term 或 term 非字符串", () => {
    expect(isExplainTermRequest({ type: "EXPLAIN_TERM_REQUEST" })).toBe(false);
    expect(isExplainTermRequest({ type: "EXPLAIN_TERM_REQUEST", term: 123 })).toBe(false);
  });

  it("守卫拒绝未知消息类型与非对象载荷", () => {
    expect(isExplainTermRequest({ type: "UNKNOWN", term: "API" })).toBe(false);
    expect(isExplainTermRequest(null)).toBe(false);
    expect(isExplainTermRequest("EXPLAIN_TERM_REQUEST")).toBe(false);
  });

  it("isConfigTestRequest 接受对象配置，拒绝缺配置", () => {
    expect(
      isConfigTestRequest({ type: "CONFIG_TEST_REQUEST", config: { baseUrl: "https://a", apiKey: "k", model: "m" } }),
    ).toBe(true);
    expect(isConfigTestRequest({ type: "CONFIG_TEST_REQUEST" })).toBe(false);
    expect(isConfigTestRequest({ type: "CONFIG_TEST_REQUEST", config: "x" })).toBe(false);
  });
});

describe("响应守卫", () => {
  it("isExplainResult 接受合法回包", () => {
    expect(isExplainResult({ ok: true, explanation: { professional: "定义", plain: "类比" } })).toBe(true);
    expect(isExplainResult({ ok: false, error: { code: "network", message: "网络错误" } })).toBe(true);
  });

  it("isExplainResult 拒绝 ok:true 但缺解释字段", () => {
    expect(isExplainResult({ ok: true })).toBe(false);
    expect(isExplainResult({ ok: true, explanation: { professional: "定义" } })).toBe(false);
    expect(isExplainResult({ ok: true, explanation: "text" })).toBe(false);
  });

  it("isExplainResult 拒绝 ok:false 但缺错误对象", () => {
    expect(isExplainResult({ ok: false })).toBe(false);
    expect(isExplainResult({ ok: false, error: "oops" })).toBe(false);
  });

  it("isConfigTestResult 形状正确", () => {
    expect(isConfigTestResult({ ok: true })).toBe(true);
    expect(isConfigTestResult({ ok: false, error: { code: "auth", message: "拒绝" } })).toBe(true);
    expect(isConfigTestResult({ ok: true, extra: 1 })).toBe(true);
  });
});

describe("助手函数兜底", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requestExplainTerm 收到 undefined 时返回 unexpected 错误", async () => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(async () => undefined) },
    });
    const result = await requestExplainTerm("API");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown");
  });

  it("requestExplainTerm 收到坏形状回包时返回 unexpected 错误", async () => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(async () => ({ ok: true, explanation: "not-object" })) },
    });
    const result = await requestExplainTerm("API");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unknown");
  });
});
