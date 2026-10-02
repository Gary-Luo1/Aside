import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beginHostPermissionRequest, originPatternFromBaseUrl } from "./host-permission.ts";

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

describe("beginHostPermissionRequest", () => {
  const previous = globalThis.chrome;

  function install(permissions: Record<string, unknown>): void {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { permissions },
    });
  }

  function restore(): void {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "chrome");
      return;
    }
    Object.defineProperty(globalThis, "chrome", { configurable: true, value: previous });
  }

  it("先调用 request，不先查 contains", async () => {
    const calls: string[] = [];
    install({
      contains: () => {
        calls.push("contains");
        return Promise.resolve(false);
      },
      request: (options: { origins: string[] }) => {
        calls.push(`request:${options.origins[0]}`);
        return Promise.resolve(true);
      },
    });
    try {
      assert.equal(await beginHostPermissionRequest("http://127.0.0.1:8765/v1"), true);
      assert.deepEqual(calls, ["request:http://127.0.0.1:8765/*"]);
    } finally {
      restore();
    }
  });

  it("浏览器拒绝申请时返回 false", async () => {
    install({
      contains: () => Promise.resolve(false),
      request: () => Promise.reject(new Error("no gesture")),
    });
    try {
      assert.equal(await beginHostPermissionRequest("http://127.0.0.1:8765/v1"), false);
    } finally {
      restore();
    }
  });
});
