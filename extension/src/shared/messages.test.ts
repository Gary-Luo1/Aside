import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MESSAGE_TYPES,
  isConfigTestResult,
  isConfigTestRequest,
  isExplainResult,
  isExplainTermRequest,
  isSetupConfigRequest,
} from "./messages.ts";

/** 后台在可信边界靠这些守卫分发，被绕过就等于信任了未校验的载荷。 */
describe("请求守卫", () => {
  it("接受形状正确的解释请求", () => {
    assert.equal(
      isExplainTermRequest({ type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST, term: "API" }),
      true,
    );
  });

  it("拒绝 term 不是字符串的解释请求", () => {
    const payload = { type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST, term: { nested: 1 } };
    assert.equal(isExplainTermRequest(payload), false);
  });

  it("拒绝缺少 term 的解释请求", () => {
    assert.equal(isExplainTermRequest({ type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST }), false);
  });

  it("接受形状正确的测试连接请求", () => {
    const request = {
      type: MESSAGE_TYPES.CONFIG_TEST_REQUEST,
      config: { baseUrl: "https://a.test/v1" },
    };
    assert.equal(isConfigTestRequest(request), true);
  });

  it("拒绝 config 不是对象的测试连接请求", () => {
    const request = { type: MESSAGE_TYPES.CONFIG_TEST_REQUEST, config: "https://a.test/v1" };
    assert.equal(isConfigTestRequest(request), false);
  });

  it("接受形状正确的就地配置请求", () => {
    const request = { type: MESSAGE_TYPES.SETUP_CONFIG_REQUEST, config: { model: "x" } };
    assert.equal(isSetupConfigRequest(request), true);
  });

  it("拒绝 null 与非对象", () => {
    assert.equal(isExplainTermRequest(null), false);
    assert.equal(isExplainTermRequest("EXPLAIN_TERM_REQUEST"), false);
    assert.equal(isConfigTestRequest(undefined), false);
    assert.equal(isSetupConfigRequest(42), false);
  });

  it("type 对不上时一律拒绝，不因字段齐全而放行", () => {
    const payload = { type: "EXPLAIN_TERM_REQUEST_something", term: "API" };
    assert.equal(isExplainTermRequest(payload), false);
  });
});

describe("响应守卫", () => {
  const okExplanation = { ok: true, explanation: { professional: "专业", plain: "通俗" } };
  const badError = { ok: false, error: { code: "network", message: "连不上" } };

  it("接受完整的成功解释", () => {
    assert.equal(isExplainResult(okExplanation), true);
  });

  it("拒绝 professional 缺字段的成功解释", () => {
    assert.equal(isExplainResult({ ok: true, explanation: { professional: "专业" } }), false);
  });

  it("拒绝 explanation 是字符串的成功解释", () => {
    assert.equal(isExplainResult({ ok: true, explanation: "不是对象" }), false);
  });

  it("接受带错误码的失败解释", () => {
    assert.equal(isExplainResult(badError), true);
  });

  it("拒绝 error 形状不完整的失败解释", () => {
    assert.equal(isExplainResult({ ok: false, error: { code: "network" } }), false);
  });

  it("拒绝 ok 既非 true 也非 false", () => {
    assert.equal(isExplainResult({ ok: "true", explanation: {} }), false);
  });

  it("接受连接测试的成功与失败", () => {
    assert.equal(isConfigTestResult({ ok: true }), true);
    assert.equal(isConfigTestResult(badError), true);
  });

  it("拒绝连接测试的畸形响应", () => {
    assert.equal(isConfigTestResult({ ok: false }), false);
    assert.equal(isConfigTestResult({ ok: false, error: "网络错误" }), false);
  });

  it("拒绝 undefined：后台无响应时不会把空值当成成功", () => {
    assert.equal(isExplainResult(undefined), false);
    assert.equal(isConfigTestResult(undefined), false);
  });
});
