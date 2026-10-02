import type { AiConfig, ExplainResult, Explanation, ExtensionError } from "../shared/messages.ts";
import type { ConfigLoadResult } from "../shared/config.ts";
import type { ApiResult, RequestOptions } from "./api-client.ts";
import { PROMPT_VERSION } from "./prompt.ts";

export interface ExplainCoordinatorDeps {
  loadConfig: () => Promise<ConfigLoadResult>;
  explain: (config: AiConfig, term: string, options?: RequestOptions) => Promise<ApiResult>;
  /** 注入时钟，便于测试缓存过期。 */
  now?: () => number;
}

/** 全局在途解释上限：超出直接拒绝，避免多标签页并发打爆接口配额。 */
export const MAX_CONCURRENT_EXPLAINS = 4;

/** 结果缓存：同一提示词版本 + 接口 + 密钥指纹 + 模型 + 词不重复计费。 */
export const CACHE_LIMIT = 50;
export const CACHE_TTL_MS = 30 * 60 * 1000;

export interface ExplainCallOptions {
  /** 跳过读取缓存，仍把新结果写回，供「重新解释」使用。 */
  refresh?: boolean;
}

/** 缓存身份。不含完整密钥，只放指纹，换密钥后同一词不会命中旧解释。 */
export function explanationCacheKey(config: AiConfig, term: string): string {
  return JSON.stringify([
    PROMPT_VERSION,
    config.baseUrl,
    config.model,
    fingerprint(config.apiKey),
    term,
  ]);
}

function fingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

interface CacheEntry {
  explanation: Explanation;
  expiresAt: number;
}

/**
 * 每个文档 frame 一个在途解释会话：同 frame 新请求中止旧请求，避免重复计费；
 * 缺少 tab/frame 标识的请求视为独立会话。配置结果在这里映射为稳定错误。
 */
export class ExplanationCoordinator {
  private readonly deps: ExplainCoordinatorDeps;
  private readonly active = new Map<string, AbortController>();
  private readonly cache = new Map<string, CacheEntry>();
  private inFlight = 0;

  constructor(deps: ExplainCoordinatorDeps) {
    this.deps = deps;
  }

  async explain(
    term: string,
    tabId: number | undefined,
    frameId?: number,
    options?: ExplainCallOptions,
  ): Promise<ExplainResult> {
    const sessionKey = toFrameSessionKey(tabId, frameId);
    const configResult = await this.deps.loadConfig();
    if (!configResult.ok) {
      if (configResult.reason === "absent") {
        return {
          ok: false,
          error: { code: "unconfigured", message: "还没有填写模型接口，请先打开设置。" },
        };
      }
      return {
        ok: false,
        error: { code: "invalid_config", message: configResult.message },
      };
    }

    const config = configResult.config;
    const now = this.deps.now?.() ?? Date.now();
    const cacheKey = explanationCacheKey(config, term);
    if (options?.refresh !== true) {
      const cached = this.readCache(cacheKey, now);
      if (cached) return { ok: true, explanation: cached };
    }

    // 查完缓存再占名额：满载时已缓存的词仍能返回。
    // 检查与占位之间不能 await，否则并发计数会漏。
    // 满载时先拒绝、再谈中止：此时中止同 frame 的旧请求只会两头落空
    // （旧请求作废已计费，新请求又没发出去）。
    if (this.inFlight >= MAX_CONCURRENT_EXPLAINS) {
      return { ok: false, error: tooManyConcurrent() };
    }
    const controller = new AbortController();
    if (sessionKey !== undefined) {
      this.active.get(sessionKey)?.abort();
      this.active.set(sessionKey, controller);
    }
    this.inFlight += 1;

    try {
      const result = await this.deps.explain(config, term, { signal: controller.signal });
      if (!result.ok) return { ok: false, error: result.error };

      this.writeCache(cacheKey, result.explanation, now);
      return { ok: true, explanation: result.explanation };
    } finally {
      this.inFlight -= 1;
      // 只清理自己登记的会话；若已被更新的请求替换则保留新会话。
      this.releaseSession(sessionKey, controller);
    }
  }

  /** 按文档 frame 取消在途请求（卡片关闭 / 换词时调用）；没有在途请求时是空操作。 */
  cancel(tabId: number | undefined, frameId?: number): void {
    const sessionKey = toFrameSessionKey(tabId, frameId);
    if (sessionKey === undefined) return;
    this.active.get(sessionKey)?.abort();
    this.active.delete(sessionKey);
  }

  /** 测试用：清空缓存与在途记录。 */
  reset(): void {
    this.cache.clear();
    this.active.clear();
    this.inFlight = 0;
  }

  private releaseSession(sessionKey: string | undefined, controller: AbortController): void {
    if (sessionKey !== undefined && this.active.get(sessionKey) === controller) {
      this.active.delete(sessionKey);
    }
  }

  private readCache(key: string, now: number): Explanation | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.cache.delete(key);
      return null;
    }
    // LRU：命中后移到末尾。
    this.cache.delete(key);
    this.cache.set(key, hit);
    return hit.explanation;
  }

  private writeCache(key: string, value: Explanation, now: number): void {
    this.cache.delete(key);
    this.cache.set(key, { explanation: value, expiresAt: now + CACHE_TTL_MS });
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }
}

/** 只有 tab 和 frame 都可识别时，才登记可取消的文档会话。 */
function toFrameSessionKey(
  tabId: number | undefined,
  frameId: number | undefined,
): string | undefined {
  if (tabId === undefined || frameId === undefined) return undefined;
  return `${tabId}:${frameId}`;
}

function tooManyConcurrent(): ExtensionError {
  return { code: "rate_limited", message: "同时解释的请求太多了，请稍后再试。" };
}
