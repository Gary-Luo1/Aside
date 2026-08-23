import type { AiConfig, Explanation, ExtensionError } from "../shared/messages";
import { parseExplanation } from "../shared/explanation";
import { hasHostPermission, hostPermissionError } from "../shared/host-permission";
import { SYSTEM_PROMPT, buildConfigTestPrompt, buildUserPrompt } from "./prompt";

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export type ApiResult =
  | { ok: true; explanation: Explanation }
  | { ok: false; error: ExtensionError };

export interface RequestOptions {
  timeoutMs?: number;
  /** 外部中止信号：新请求/关闭场景下由后台中止旧请求。 */
  signal?: AbortSignal;
}

/** 连接测试：固定低成本短词，验证接口与输出结构。 */
export async function testConnection(
  config: AiConfig,
  options: RequestOptions = {},
): Promise<ApiResult> {
  return requestChatCompletion(config, buildConfigTestPrompt(), options);
}

export async function explainTerm(
  config: AiConfig,
  term: string,
  options: RequestOptions = {},
): Promise<ApiResult> {
  return requestChatCompletion(config, buildUserPrompt(term), options);
}

async function requestChatCompletion(
  config: AiConfig,
  userText: string,
  options: RequestOptions,
): Promise<ApiResult> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  try {
    const allowed = await hasHostPermission(config.baseUrl);
    if (!allowed) {
      return { ok: false, error: hostPermissionError() };
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: mapHttpError(response.status) };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        error: { code: "bad_response", message: "暂时没法生成解释，请稍后重试。" },
      };
    }

    const content = extractAssistantContent(payload);
    if (content === null) {
      return {
        ok: false,
        error: { code: "bad_response", message: "暂时没法生成解释，请稍后重试。" },
      };
    }

    const explanation = parseExplanation(content);
    if (!explanation) {
      return {
        ok: false,
        error: { code: "bad_response", message: "暂时没法生成解释，请稍后重试。" },
      };
    }

    return { ok: true, explanation };
  } catch (error) {
    if (options.signal?.aborted) {
      return {
        ok: false,
        error: { code: "unknown", message: "这次解释已取消。" },
      };
    }
    if (isAbortError(error)) {
      return {
        ok: false,
        error: { code: "timeout", message: "等太久没有结果，请稍后重试。" },
      };
    }
    return {
      ok: false,
      error: { code: "network", message: "连不上这个地址，请检查网络和填写的接口地址。" },
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractAssistantContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.choices) || root.choices.length === 0) return null;
  const first = root.choices[0] as Record<string, unknown> | undefined;
  if (typeof first !== "object" || first === null) return null;
  const message = first.message as Record<string, unknown> | undefined;
  if (typeof message !== "object" || message === null) return null;
  const content = message.content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

function mapHttpError(status: number): ExtensionError {
  switch (status) {
    case 401:
    case 403:
      return { code: "auth", message: "密钥不正确，请检查后再试。" };
    case 404:
      return { code: "not_found", message: "接口地址或模型名称不对，请检查后再试。" };
    case 429:
      return { code: "rate_limited", message: "请求太频繁，请稍后再试。" };
    default:
      if (status >= 500) {
        return { code: "server_error", message: "模型服务暂时不可用，请稍后重试。" };
      }
      return { code: "unknown", message: "暂时没法完成这次解释，请稍后重试。" };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
