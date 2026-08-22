// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { explainTerm, testConnection } from "../../src/background/api-client";
import type { AiConfig } from "../../src/shared/messages";

const OK_CONTENT = JSON.stringify({ professional: "定义", plain: "类比" });

let server: Server;
let port = 0;
let lastRequestBody: Record<string, unknown> | null = null;

function response(res: import("node:http").ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw);
      } catch {
        body = {};
      }
      lastRequestBody = body;
      const messages = body.messages as Array<{ content?: string }> | undefined;
      const userText = messages?.find((m) => m.role === "user")?.content ?? "";

      if (userText.includes("__status_401")) {
        response(res, 401, JSON.stringify({ error: { message: "bad key" } }));
      } else if (userText.includes("__status_404")) {
        response(res, 404, JSON.stringify({ error: { message: "no model" } }));
      } else if (userText.includes("__status_429")) {
        response(res, 429, JSON.stringify({ error: { message: "rate" } }));
      } else if (userText.includes("__status_500")) {
        response(res, 500, JSON.stringify({ error: { message: "boom" } }));
      } else if (userText.includes("__bad_json")) {
        response(res, 200, "not json at all");
      } else if (userText.includes("__missing_plain")) {
        response(res, 200, JSON.stringify({ professional: "定义" }));
      } else if (userText.includes("__fence")) {
        response(res, 200, JSON.stringify({ choices: [{ message: { content: "```json\n" + OK_CONTENT + "\n```" } }] }));
      } else if (userText.includes("__slow")) {
        setTimeout(() => {
          response(res, 200, JSON.stringify({ choices: [{ message: { content: OK_CONTENT } }] }));
        }, 500);
      } else {
        response(res, 200, JSON.stringify({ choices: [{ message: { content: OK_CONTENT } }] }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function configFor(term: string): AiConfig {
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "sk-test",
    model: "fake-model",
  };
}

describe("api-client 真实 HTTP 链路", () => {
  it("正常返回双层解释", async () => {
    const result = await explainTerm(configFor("API"), "API");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.explanation).toEqual({ professional: "定义", plain: "类比" });
    }
  });

  it("接受 code fence 包裹的 JSON", async () => {
    const result = await explainTerm(configFor("__fence"), "__fence");
    expect(result.ok).toBe(true);
  });

  it("请求体只包含最小公共字段", async () => {
    await explainTerm(configFor("API"), "API");
    expect(lastRequestBody).not.toBeNull();
    expect(lastRequestBody).toMatchObject({
      model: "fake-model",
      temperature: 0.3,
      stream: false,
    });
    expect(Object.keys(lastRequestBody ?? {})).toEqual(
      expect.arrayContaining(["model", "messages", "temperature", "stream"]),
    );
    const messages = (lastRequestBody as { messages: unknown }).messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain("<<<TERM");
    expect(messages[1]?.content).toContain("API");
    expect(messages[1]?.content).toContain("TERM>>>");
    const serialized = JSON.stringify(lastRequestBody);
    expect(serialized).not.toContain("pageUrl");
    expect(serialized).not.toContain("title");
    expect(serialized).not.toContain("paragraph");
  });

  it("缺字段时返回 bad_response", async () => {
    const result = await explainTerm(configFor("__missing_plain"), "__missing_plain");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_response");
  });

  it("非 JSON 响应返回 bad_response", async () => {
    const result = await explainTerm(configFor("__bad_json"), "__bad_json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad_response");
  });

  it("401 映射为 auth", async () => {
    const result = await explainTerm(configFor("__status_401"), "__status_401");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("auth");
  });

  it("404 映射为 not_found", async () => {
    const result = await explainTerm(configFor("__status_404"), "__status_404");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("429 映射为 rate_limited", async () => {
    const result = await explainTerm(configFor("__status_429"), "__status_429");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("rate_limited");
  });

  it("5xx 映射为 server_error", async () => {
    const result = await explainTerm(configFor("__status_500"), "__status_500");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("server_error");
  });

  it("超时映射为 timeout", async () => {
    const result = await explainTerm(configFor("__slow"), "__slow", { timeoutMs: 60 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("timeout");
  });

  it("外部 signal 中止返回已取消，不等待服务端", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 60);
    const start = Date.now();
    const result = await explainTerm(configFor("__slow"), "__slow", {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown");
      expect(result.error.message).toBe("这次解释已取消。");
    }
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  it("连接失败映射为 network", async () => {
    const result = await explainTerm(
      { baseUrl: "http://127.0.0.1:1/v1", apiKey: "k", model: "m" },
      "API",
      { timeoutMs: 500 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("network");
  });

  it("错误信息不包含密钥或响应体", async () => {
    const result = await explainTerm(configFor("__status_401"), "__status_401");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain("sk-test");
      expect(result.error.message).not.toContain("bad key");
      expect(result.error.message).not.toContain("Authorization");
    }
  });

  it("连接测试使用固定短词且成功", async () => {
    const result = await testConnection(configFor("API"));
    expect(result.ok).toBe(true);
  });
});
