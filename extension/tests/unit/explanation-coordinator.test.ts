import { describe, expect, it, vi } from "vitest";
import {
  ExplanationCoordinator,
  type ExplainCoordinatorDeps,
} from "../../src/background/explanation-coordinator";
import type { ApiResult } from "../../src/background/api-client";
import type { AiConfig } from "../../src/shared/messages";
import type { ConfigLoadResult } from "../../src/shared/config";

const sampleConfig: AiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "gpt-4o",
};

const okResult: ApiResult = { ok: true, explanation: { professional: "定义", plain: "类比" } };
const cancelled: ApiResult = { ok: false, error: { code: "unknown", message: "请求已取消。" } };

interface ExplainCall {
  term: string;
  signal: AbortSignal;
  resolve: (result: ApiResult) => void;
}

function makeFake(configResult: ConfigLoadResult) {
  const calls: ExplainCall[] = [];
  const deps: ExplainCoordinatorDeps = {
    loadConfig: vi.fn(async () => configResult),
    explain: vi.fn(
      (_config: AiConfig, term: string, options?: { signal?: AbortSignal }) =>
        new Promise<ApiResult>((resolve) => {
          calls.push({ term, signal: options?.signal ?? new AbortController().signal, resolve });
        }),
    ),
  };
  return { deps, calls };
}

/** 等 fake explain 被调用到期望次数（协调器内部有若干微任务）。 */
async function waitForCalls(calls: ExplainCall[], count: number): Promise<void> {
  await vi.waitFor(() => expect(calls).toHaveLength(count));
}

describe("ExplanationCoordinator", () => {
  it("同标签页新请求中止旧请求，且只有新请求结果可用", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 1, 0);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", 1, 0);
    await waitForCalls(calls, 2);

    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);

    calls[0]!.resolve(cancelled);
    calls[1]!.resolve(okResult);
    const [r1, r2] = await Promise.all([first, second]);

    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("unknown");
    expect(r2.ok).toBe(true);
  });

  it("不同标签页互不影响", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 1, 0);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", 2, 0);
    await waitForCalls(calls, 2);

    expect(calls[0]!.signal.aborted).toBe(false);
    expect(calls[1]!.signal.aborted).toBe(false);

    calls[0]!.resolve(okResult);
    calls[1]!.resolve(okResult);
    await Promise.all([first, second]);
  });

  it("无 tabId 的请求各自独立，不互相中止", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", undefined, undefined);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", undefined, undefined);
    await waitForCalls(calls, 2);

    expect(calls[0]!.signal.aborted).toBe(false);
    calls[0]!.resolve(okResult);
    calls[1]!.resolve(okResult);
    await Promise.all([first, second]);
  });

  it("配置 absent 时返回 unconfigured 且不发起解释", async () => {
    const { deps, calls } = makeFake({ ok: false, reason: "absent" });
    const coordinator = new ExplanationCoordinator(deps);

    const result = await coordinator.explain("API", 1, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unconfigured");
      expect(result.error.message).toContain("还没有填写");
    }
    expect(calls).toHaveLength(0);
  });

  it("配置损坏时返回 invalid_config 并带用户可读消息", async () => {
    const { deps, calls } = makeFake({
      ok: false,
      reason: "invalid",
      message: "配置无效：Model 不能为空。",
    });
    const coordinator = new ExplanationCoordinator(deps);

    const result = await coordinator.explain("API", 1, 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_config");
      expect(result.error.message).toBe("配置无效：Model 不能为空。");
    }
    expect(calls).toHaveLength(0);
  });

  it("解释成功结果透传为 ExplainResult", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const pending = coordinator.explain("API", 7, 0);
    await waitForCalls(calls, 1);
    expect(deps.explain).toHaveBeenCalledWith(sampleConfig, "API", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    calls[0]!.resolve(okResult);

    const result = await pending;
    expect(result).toEqual({ ok: true, explanation: { professional: "定义", plain: "类比" } });
  });

  it("结束后清理会话：同标签页新请求拿到全新未中止的 signal", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 3, 0);
    await waitForCalls(calls, 1);
    calls[0]!.resolve(okResult);
    await first;

    const second = coordinator.explain("算法", 3, 0);
    await waitForCalls(calls, 2);
    expect(calls[1]!.signal.aborted).toBe(false);
    calls[1]!.resolve(okResult);
    await second;
  });

  it("同标签页旧请求结束时不会误清新请求的会话", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 5, 0);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", 5, 0);
    await waitForCalls(calls, 2);

    // 旧请求先结束（其 finally 不得删除新请求的会话），随后新请求照常拿到未中止 signal。
    calls[0]!.resolve(cancelled);
    await first;

    expect(calls[1]!.signal.aborted).toBe(false);
    calls[1]!.resolve(okResult);
    const r2 = await second;
    expect(r2.ok).toBe(true);
  });

  it("同标签页不同 frame 不互相中止", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 5, 1);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", 5, 2);
    await waitForCalls(calls, 2);

    expect(calls[0]!.signal.aborted).toBe(false);
    expect(calls[1]!.signal.aborted).toBe(false);
    calls[0]!.resolve(okResult);
    calls[1]!.resolve(okResult);
    await Promise.all([first, second]);
  });

  it("缺少 tab 或 frame 标识时请求各自独立", async () => {
    const { deps, calls } = makeFake({ ok: true, config: sampleConfig });
    const coordinator = new ExplanationCoordinator(deps);

    const first = coordinator.explain("API", 5, undefined);
    await waitForCalls(calls, 1);
    const second = coordinator.explain("算法", undefined, 2);
    await waitForCalls(calls, 2);

    expect(calls[0]!.signal.aborted).toBe(false);
    expect(calls[1]!.signal.aborted).toBe(false);
    calls[0]!.resolve(okResult);
    calls[1]!.resolve(okResult);
    await Promise.all([first, second]);
  });
});
