import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { originPatternFromBaseUrl } from "./host-permission.ts";

describe("originPatternFromBaseUrl", () => {
  it("https 地址转成 origin 匹配模式", () => {
    assert.equal(
      originPatternFromBaseUrl("https://api.example.com/v1"),
      "https://api.example.com/*",
    );
  });

  it("丢弃路径，只保留 origin", () => {
    assert.equal(
      originPatternFromBaseUrl("https://api.example.com/v1/chat/completions"),
      "https://api.example.com/*",
    );
  });

  it("保留显式端口", () => {
    assert.equal(originPatternFromBaseUrl("http://localhost:3000"), "http://localhost:3000/*");
  });

  it("拒绝非 http(s) 协议", () => {
    assert.equal(originPatternFromBaseUrl("ftp://example.com"), null);
    assert.equal(originPatternFromBaseUrl("file:///etc/passwd"), null);
  });

  it("非法 URL 返回 null", () => {
    assert.equal(originPatternFromBaseUrl("not a url"), null);
    assert.equal(originPatternFromBaseUrl(""), null);
  });
});
