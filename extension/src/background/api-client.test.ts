import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractAssistantContent, mapHttpError } from "./api-client.ts";

describe("extractAssistantContent", () => {
  it("取出字符串 content", () => {
    const payload = {
      choices: [{ message: { role: "assistant", content: '{"professional":"P","plain":"L"}' } }],
    };
    assert.equal(extractAssistantContent(payload), '{"professional":"P","plain":"L"}');
  });

  it("空白字符串视为无内容", () => {
    const payload = { choices: [{ message: { content: "   " } }] };
    assert.equal(extractAssistantContent(payload), null);
  });

  it("拼接分段数组 content（部分兼容端点的返回形状）", () => {
    const payload = {
      choices: [
        {
          message: {
            content: [
              { type: "text", text: '{"professional":' },
              { type: "text", text: '"P","plain":"L"}' },
            ],
          },
        },
      ],
    };
    assert.equal(extractAssistantContent(payload), '{"professional":"P","plain":"L"}');
  });

  it("分段数组里没有文本段时视为无内容", () => {
    const payload = {
      choices: [{ message: { content: [{ type: "image_url" }, { type: "text", text: "  " }] } }],
    };
    assert.equal(extractAssistantContent(payload), null);
  });

  it("content 是其他类型时拒绝", () => {
    assert.equal(extractAssistantContent({ choices: [{ message: { content: 42 } }] }), null);
    assert.equal(extractAssistantContent({ choices: [{ message: { content: null } }] }), null);
  });

  it("结构缺失时返回 null", () => {
    assert.equal(extractAssistantContent({}), null);
    assert.equal(extractAssistantContent({ choices: [] }), null);
    assert.equal(extractAssistantContent({ choices: [{}] }), null);
    assert.equal(extractAssistantContent({ choices: [{ message: {} }] }), null);
    assert.equal(extractAssistantContent("not an object"), null);
  });
});

describe("mapHttpError", () => {
  it("400 映射为 bad_request，指向模型名称排查", () => {
    assert.equal(mapHttpError(400).code, "bad_request");
  });

  it("鉴权类错误映射为 auth", () => {
    assert.equal(mapHttpError(401).code, "auth");
    assert.equal(mapHttpError(403).code, "auth");
  });

  it("404 与 429 各自映射", () => {
    assert.equal(mapHttpError(404).code, "not_found");
    assert.equal(mapHttpError(429).code, "rate_limited");
  });

  it("5xx 映射为 server_error", () => {
    assert.equal(mapHttpError(500).code, "server_error");
    assert.equal(mapHttpError(503).code, "server_error");
  });

  it("其余状态归入 unknown", () => {
    assert.equal(mapHttpError(418).code, "unknown");
  });
});
