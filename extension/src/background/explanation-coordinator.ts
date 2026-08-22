import type { AiConfig, ExplainResult } from "../shared/messages";
import type { ConfigLoadResult } from "../shared/config";
import type { ApiResult, RequestOptions } from "./api-client";

export interface ExplainCoordinatorDeps {
  loadConfig: () => Promise<ConfigLoadResult>;
  explain: (config: AiConfig, term: string, options?: RequestOptions) => Promise<ApiResult>;
}

/**
 * 每个文档 frame 一个在途解释会话：同 frame 新请求中止旧请求，避免重复计费；
 * 缺少 tab/frame 标识的请求视为独立会话。配置结果在这里映射为稳定错误。
 */
export class ExplanationCoordinator {
  private readonly deps: ExplainCoordinatorDeps;
  private readonly active = new Map<string, AbortController>();

  constructor(deps: ExplainCoordinatorDeps) {
    this.deps = deps;
  }

  async explain(term: string, tabId: number | undefined, frameId?: number): Promise<ExplainResult> {
    const sessionKey = toFrameSessionKey(tabId, frameId);
    const controller = new AbortController();
    if (sessionKey !== undefined) {
      this.active.get(sessionKey)?.abort();
      this.active.set(sessionKey, controller);
    }

    try {
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

      const result = await this.deps.explain(configResult.config, term, { signal: controller.signal });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, explanation: result.explanation };
    } finally {
      // 只清理自己登记的会话；若已被更新的请求替换则保留新会话。
      if (sessionKey !== undefined && this.active.get(sessionKey) === controller) {
        this.active.delete(sessionKey);
      }
    }
  }
}

/** 只有 tab 和 frame 都可识别时，才登记可取消的文档会话。 */
function toFrameSessionKey(tabId: number | undefined, frameId: number | undefined): string | undefined {
  if (tabId === undefined || frameId === undefined) return undefined;
  return `${tabId}:${frameId}`;
}
