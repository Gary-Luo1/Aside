import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowsCardSetup,
  normalizeBaseUrl,
  validateConfig,
  type ConfigLoadResult,
} from "./config.ts";

describe("normalizeBaseUrl", () => {
  it("接受 https 地址并去掉尾斜杠", () => {
    assert.equal(normalizeBaseUrl("https://api.example.com/v1/"), "https://api.example.com/v1");
    assert.equal(normalizeBaseUrl("https://api.example.com/v1///"), "https://api.example.com/v1");
  });

  it("本机调试允许 http://localhost 与 http://127.0.0.1（含端口）", () => {
    assert.equal(normalizeBaseUrl("http://localhost:8000/v1"), "http://localhost:8000/v1");
    assert.equal(normalizeBaseUrl("http://127.0.0.1/v1"), "http://127.0.0.1/v1");
  });

  it("拒绝其他 http 地址", () => {
    assert.equal(normalizeBaseUrl("http://api.example.com/v1"), null);
    assert.equal(normalizeBaseUrl("http://192.168.1.2/v1"), null);
  });

  it("拒绝带 query 或 hash 的地址", () => {
    assert.equal(normalizeBaseUrl("https://api.example.com/v1?k=1"), null);
    assert.equal(normalizeBaseUrl("https://api.example.com/v1#frag"), null);
  });

  it("拒绝空串、空白与非字符串", () => {
    assert.equal(normalizeBaseUrl(""), null);
    assert.equal(normalizeBaseUrl("   "), null);
    assert.equal(normalizeBaseUrl(42), null);
    assert.equal(normalizeBaseUrl(null), null);
  });

  it("拒绝解析不了的字符串", () => {
    assert.equal(normalizeBaseUrl("api.example.com/v1"), null);
    assert.equal(normalizeBaseUrl("https://"), null);
  });
});

describe("validateConfig", () => {
  it("规范化并返回三项配置", () => {
    const result = validateConfig({
      baseUrl: " https://api.example.com/v1/ ",
      apiKey: " sk-1 ",
      model: " qwen-plus ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.config, {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-1",
        model: "qwen-plus",
      });
    }
  });

  it("缺密钥或模型时给出对应提示", () => {
    const noKey = validateConfig({ baseUrl: "https://a.test/v1", apiKey: " ", model: "m" });
    assert.equal(noKey.ok, false);
    const noModel = validateConfig({ baseUrl: "https://a.test/v1", apiKey: "k", model: "" });
    assert.equal(noModel.ok, false);
    const badUrl = validateConfig({ baseUrl: "http://a.test/v1", apiKey: "k", model: "m" });
    assert.equal(badUrl.ok, false);
  });

  it("非对象输入直接拒绝", () => {
    assert.equal(validateConfig(null).ok, false);
    assert.equal(validateConfig("x").ok, false);
  });
});

describe("allowsCardSetup", () => {
  const config = { baseUrl: "https://a.test/v1", apiKey: "k", model: "m" };
  const absent: ConfigLoadResult = { ok: false, reason: "absent" };
  const invalid: ConfigLoadResult = { ok: false, reason: "invalid", message: "坏配置" };
  const valid: ConfigLoadResult = { ok: true, config };

  it("从未配置时允许卡片内首配", () => {
    assert.equal(allowsCardSetup(absent), true);
  });

  it("存储损坏时允许卡片内自愈", () => {
    assert.equal(allowsCardSetup(invalid), true);
  });

  it("已有有效配置时拒绝卡片内改写", () => {
    assert.equal(allowsCardSetup(valid), false);
  });
});
