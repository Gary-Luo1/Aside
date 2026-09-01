import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CACHE_LIMIT,
  CACHE_TTL_MS,
  ExplanationCoordinator,
  MAX_CONCURRENT_EXPLAINS,
  type ExplainCoordinatorDeps,
} from "./explanation-coordinator.ts";
import type { AiConfig, Explanation } from "../shared/messages.ts";

const config: AiConfig = { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m" };
const explanation: Explanation = { professional: "P", plain: "L" };

function deps(over: Partial<ExplainCoordinatorDeps> = {}): ExplainCoordinatorDeps {
  return {
    loadConfig: async () => ({ ok: true as const, config }),
    explain: async () => ({ ok: true as const, explanation }),
    now: () => 1_000,
    ...over,
  };
}

/** 手动闸门：explain 挂在 gate 上，拿到 release 后统一放行，用于构造在途请求。 */
function createGate(): { gate: Promise<void>; release: () => void } {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

/** 记录每个词的 abort signal、并挂在 gate 上的 explain 桩。 */
function explainRecordingSignals(
  signals: Map<string, AbortSignal | undefined>,
  gate: Promise<void>,
): ExplainCoordinatorDeps["explain"] {
  return async (_cfg, term, options) => {
    signals.set(term, options?.signal);
    await gate;
    return { ok: true as const, explanation };
  };
}

describe("ExplanationCoordinator 配置映射", () => {
  it("未配置时返回 unconfigured", async () => {
    const c = new ExplanationCoordinator(
      deps({ loadConfig: async () => ({ ok: false, reason: "absent" }) }),
    );
    const result = await c.explain("闭包", 1, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "unconfigured");
  });

  it("配置损坏时返回 invalid_config", async () => {
    const c = new ExplanationCoordinator(
      deps({ loadConfig: async () => ({ ok: false, reason: "invalid", message: "接口地址无效" }) }),
    );
    const result = await c.explain("闭包", 1, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "invalid_config");
  });

  it("解释失败时原样透传错误", async () => {
    const c = new ExplanationCoordinator(
      deps({ explain: async () => ({ ok: false, error: { code: "auth", message: "密钥不对" } }) }),
    );
    const result = await c.explain("闭包", 1, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "auth");
  });
});

describe("ExplanationCoordinator 结果缓存", () => {
  it("同一模型同一词只请求一次", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        explain: async () => {
          calls += 1;
          return { ok: true, explanation };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    await c.explain("闭包", 1, 0);
    assert.equal(calls, 1);
  });

  it("不同的词各自请求", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        explain: async () => {
          calls += 1;
          return { ok: true, explanation };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    await c.explain("柯里化", 1, 0);
    assert.equal(calls, 2);
  });

  it("缓存按模型区分", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        loadConfig: async () => ({
          ok: true as const,
          config: { ...config, model: calls === 0 ? "m" : "m2" },
        }),
        explain: async () => {
          calls += 1;
          return { ok: true as const, explanation };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    await c.explain("闭包", 1, 0);
    assert.equal(calls, 2);
  });

  it("不同接口地址不共享缓存（同名模型属于不同服务商）", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        loadConfig: async () => ({
          ok: true as const,
          config: { ...config, baseUrl: calls === 0 ? "https://a.test/v1" : "https://b.test/v1" },
        }),
        explain: async () => {
          calls += 1;
          return { ok: true as const, explanation };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    await c.explain("闭包", 1, 0);
    assert.equal(calls, 2);
  });

  it("过期后重新请求", async () => {
    let calls = 0;
    let now = 1_000;
    const c = new ExplanationCoordinator(
      deps({
        now: () => now,
        explain: async () => {
          calls += 1;
          return { ok: true, explanation };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    now += CACHE_TTL_MS + 1;
    await c.explain("闭包", 1, 0);
    assert.equal(calls, 2);
  });

  it("缓存条目数不超过上限", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        explain: async () => {
          calls += 1;
          return { ok: true, explanation };
        },
      }),
    );
    for (let i = 0; i < CACHE_LIMIT + 10; i += 1) {
      await c.explain(`term${i}`, i, 0);
    }
    // 再问第一个词，应该已经溢出被丢弃
    await c.explain("term0", 999, 0);
    assert.equal(calls, CACHE_LIMIT + 11);
  });

  it("失败结果不进缓存", async () => {
    let calls = 0;
    const c = new ExplanationCoordinator(
      deps({
        explain: async () => {
          calls += 1;
          return { ok: false, error: { code: "server_error", message: "服务不可用" } };
        },
      }),
    );
    await c.explain("闭包", 1, 0);
    await c.explain("闭包", 1, 0);
    assert.equal(calls, 2);
  });
});

describe("ExplanationCoordinator 并发控制", () => {
  it("同 frame 的新请求中止旧请求", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const { gate, release } = createGate();
    const c = new ExplanationCoordinator(
      deps({
        explain: async (_cfg, _term, options) => {
          seen.push(options?.signal);
          await gate;
          return { ok: true, explanation };
        },
      }),
    );

    const first = c.explain("闭包", 1, 0);
    const second = c.explain("柯里化", 1, 0);
    release();
    await Promise.all([first, second]);

    assert.equal(seen.length, 2);
    assert.ok(seen[0]?.aborted, "旧请求应被中止");
    assert.ok(!seen[1]?.aborted, "新请求不应被中止");
  });

  it("不同 frame 的请求互不中止", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const { gate, release } = createGate();
    const c = new ExplanationCoordinator(
      deps({
        explain: async (_cfg, _term, options) => {
          seen.push(options?.signal);
          await gate;
          return { ok: true, explanation };
        },
      }),
    );

    const a = c.explain("闭包", 1, 0);
    const b = c.explain("柯里化", 2, 0);
    release();
    await Promise.all([a, b]);

    assert.ok(!seen[0]?.aborted);
    assert.ok(!seen[1]?.aborted);
  });

  it("超过全局并发上限时拒绝多余请求", async () => {
    const { gate, release } = createGate();
    const c = new ExplanationCoordinator(
      deps({
        explain: async () => {
          await gate;
          return { ok: true as const, explanation };
        },
      }),
    );

    const total = MAX_CONCURRENT_EXPLAINS + 2;
    const pending = [];
    for (let i = 0; i < total; i += 1) {
      pending.push(c.explain(`term${i}`, i, 0));
    }
    release();
    const results = await Promise.all(pending);

    const rejected = results.filter((r) => !r.ok && r.error.code === "rate_limited");
    const accepted = results.filter((r) => r.ok);
    assert.equal(accepted.length, MAX_CONCURRENT_EXPLAINS);
    assert.equal(rejected.length, 2);
  });

  it("满载时拒绝同 frame 的新请求，但不中止该 frame 的在途请求", async () => {
    const signals = new Map<string, AbortSignal | undefined>();
    const { gate, release } = createGate();
    const c = new ExplanationCoordinator(deps({ explain: explainRecordingSignals(signals, gate) }));

    // 用互不相同的 frame 占满全局并发，其中 frame(0,0) 有一个在途请求
    const pending = [];
    for (let i = 0; i < MAX_CONCURRENT_EXPLAINS; i += 1) {
      pending.push(c.explain(`占位${i}`, i, 0));
    }
    const rejected = await c.explain("新词", 0, 0);

    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error.code, "rate_limited");
    // 关键回归点：拒绝发生在中止之前，在途请求不受牵连
    assert.equal(signals.get("占位0")?.aborted, false);

    release();
    const results = await Promise.all(pending);
    for (const result of results) {
      assert.equal(result.ok, true);
    }
  });

  it("cancel 中止指定 frame 的在途请求，不影响其他 frame", async () => {
    const signals = new Map<string, AbortSignal | undefined>();
    const { gate, release } = createGate();
    const c = new ExplanationCoordinator(deps({ explain: explainRecordingSignals(signals, gate) }));

    const a = c.explain("闭包", 1, 0);
    const b = c.explain("柯里化", 2, 0);
    // 等 loadConfig 解析、explain 各自登记 signal 之后再取消
    await new Promise((resolve) => setTimeout(resolve, 0));
    c.cancel(1, 0);

    assert.equal(signals.get("闭包")?.aborted, true);
    assert.equal(signals.get("柯里化")?.aborted, false);

    release();
    await Promise.all([a, b]);
  });

  it("cancel 未登记的 frame 是空操作", async () => {
    const c = new ExplanationCoordinator(deps());
    c.cancel(99, 9);
    const result = await c.explain("闭包", 1, 0);
    assert.equal(result.ok, true);
  });

  it("请求结束后并发计数归还", async () => {
    const c = new ExplanationCoordinator(deps());
    for (let i = 0; i < MAX_CONCURRENT_EXPLAINS; i += 1) {
      await c.explain(`term${i}`, i, 0);
    }
    // 前面的都已完成，新的请求应能通过而不是被限流
    const result = await c.explain("新词", 99, 0);
    assert.ok(result.ok);
  });
});
