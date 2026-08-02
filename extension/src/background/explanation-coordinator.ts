import type { AiConfig } from "../shared/messages";
import type { ConfigLoadResult } from "../shared/config";
import type { ExplainResult } from "../shared/messages";
import type { ApiResult, RequestOptions } from "./api-client";

export interface ExplainCoordinatorDeps {
  loadConfig: () => Promise<ConfigLoadResult>;
  explain: (config: AiConfig, term: string, options?: RequestOptions) => Promise<ApiResult>;
}

/**
 * 每标签页一个在途解释会话：新请求中止同标签页旧请求，避免重复计费；
 * 无 tabId 的请求视为独立会话。配置结果在这里映射为稳定错误。
 */
export class ExplanationCoordinator {
  private readonly deps: ExplainCoordinatorDeps;
  private readonly active = new Map<number, AbortController>();

  constructor(deps: ExplainCoordinatorDeps) {
    this.deps = deps;
  }

  async explain(term: string, tabId: number | undefined): Promise<ExplainResult> {
    const previous = tabId !== undefined ? this.active.get(tabId) : undefined;
    previous?.abort();
    const controller = new AbortController();
    if (tabId !== undefined) this.active.set(tabId, controller);

    try {
      const configResult = await this.deps.loadConfig();
      if (!configResult.ok) {
        return {
          ok: false,
          error:
            configResult.reason === "absent"
              ? { code: "unconfigured", message: "尚未配置 AI 接口，请先到设置页完成配置。" }
              : { code: "invalid_config", message: configResult.message },
        };
      }

      const result = await this.deps.explain(configResult.config, term, { signal: controller.signal });
      return result.ok
        ? { ok: true, explanation: result.explanation }
        : { ok: false, error: result.error };
    } finally {
      // 只清理自己登记的会话；若已被更新的请求替换则保留新会话。
      if (tabId !== undefined && this.active.get(tabId) === controller) {
        this.active.delete(tabId);
      }
    }
  }
}
