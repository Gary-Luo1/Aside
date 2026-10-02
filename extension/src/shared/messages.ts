import { isRecord } from "./guard.ts";

/** 用户配置的 OpenAI 兼容接口参数。 */
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 双层解释结果。 */
export interface Explanation {
  professional: string;
  plain: string;
}

export const ERROR_CODES = [
  "unconfigured",
  "invalid_term",
  "invalid_config",
  "config_locked",
  "network",
  "auth",
  "bad_request",
  "not_found",
  "rate_limited",
  "server_error",
  "timeout",
  "bad_response",
  "host_permission",
  "unknown",
] as const;

export type ExtensionErrorCode = (typeof ERROR_CODES)[number];

/** 稳定的错误码 + 用户可读信息，不携带原始异常、密钥或响应体。 */
export interface ExtensionError {
  code: ExtensionErrorCode;
  message: string;
}

export const MESSAGE_TYPES = {
  CONFIG_TEST_REQUEST: "CONFIG_TEST_REQUEST",
  EXPLAIN_TERM_REQUEST: "EXPLAIN_TERM_REQUEST",
  CANCEL_EXPLAIN_REQUEST: "CANCEL_EXPLAIN_REQUEST",
  SETUP_CONFIG_REQUEST: "SETUP_CONFIG_REQUEST",
  PUBLIC_CONFIG_REQUEST: "PUBLIC_CONFIG_REQUEST",
  GRANT_HOST_PERMISSION_REQUEST: "GRANT_HOST_PERMISSION_REQUEST",
  OPEN_OPTIONS_REQUEST: "OPEN_OPTIONS_REQUEST",
} as const;

/** 卡片内保存：create 只允许尚无有效配置；replace 用于用户改密钥或模型。 */
export type SetupMode = "create" | "replace";

/** content/options → 后台 的请求；载荷在后台可信边界重新校验。 */
export type RuntimeRequest =
  | { type: typeof MESSAGE_TYPES.CONFIG_TEST_REQUEST; config: AiConfig }
  | { type: typeof MESSAGE_TYPES.EXPLAIN_TERM_REQUEST; term: string; refresh?: boolean }
  | { type: typeof MESSAGE_TYPES.CANCEL_EXPLAIN_REQUEST }
  | { type: typeof MESSAGE_TYPES.SETUP_CONFIG_REQUEST; config: AiConfig; mode?: SetupMode }
  | { type: typeof MESSAGE_TYPES.PUBLIC_CONFIG_REQUEST }
  | { type: typeof MESSAGE_TYPES.GRANT_HOST_PERMISSION_REQUEST }
  | { type: typeof MESSAGE_TYPES.OPEN_OPTIONS_REQUEST };

/** 后台对解释请求的稳定响应。 */
export type ExplainResult =
  { ok: true; explanation: Explanation } | { ok: false; error: ExtensionError };

/** 后台对连接测试请求的稳定响应。 */
export type ConfigTestResult = { ok: true } | { ok: false; error: ExtensionError };

/** 后台对「卡片内配置」保存请求的稳定响应。 */
export type SetupConfigResult = { ok: true } | { ok: false; error: ExtensionError };

/** 只含接口地址和模型名，绝不含密钥。供卡片预填，页面脚本读不到 closed shadow。 */
export type PublicConfigResult =
  { ok: true; baseUrl: string; model: string } | { ok: false; error: ExtensionError };

// —— 载荷守卫：后台在可信边界按具体类型分发，不再只信 type 字符串 ——

export function isExplainTermRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.EXPLAIN_TERM_REQUEST; term: string; refresh?: boolean } {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.EXPLAIN_TERM_REQUEST &&
    typeof value.term === "string" &&
    (!("refresh" in value) || typeof value.refresh === "boolean")
  );
}

export function isCancelExplainRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.CANCEL_EXPLAIN_REQUEST } {
  return isRecord(value) && value.type === MESSAGE_TYPES.CANCEL_EXPLAIN_REQUEST;
}

export function isConfigTestRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.CONFIG_TEST_REQUEST; config: AiConfig } {
  return (
    isRecord(value) && value.type === MESSAGE_TYPES.CONFIG_TEST_REQUEST && isRecord(value.config)
  );
}

export function isSetupConfigRequest(value: unknown): value is {
  type: typeof MESSAGE_TYPES.SETUP_CONFIG_REQUEST;
  config: AiConfig;
  mode?: SetupMode;
} {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.SETUP_CONFIG_REQUEST &&
    isRecord(value.config) &&
    (!("mode" in value) || value.mode === "create" || value.mode === "replace")
  );
}

export function isPublicConfigRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.PUBLIC_CONFIG_REQUEST } {
  return isRecord(value) && value.type === MESSAGE_TYPES.PUBLIC_CONFIG_REQUEST;
}

export function isGrantHostPermissionRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.GRANT_HOST_PERMISSION_REQUEST } {
  return isRecord(value) && value.type === MESSAGE_TYPES.GRANT_HOST_PERMISSION_REQUEST;
}

export function isOpenOptionsRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.OPEN_OPTIONS_REQUEST } {
  return isRecord(value) && value.type === MESSAGE_TYPES.OPEN_OPTIONS_REQUEST;
}

// —— 响应守卫：助手函数校验真实回包形状，不再靠强转 ——

export function isExplainResult(value: unknown): value is ExplainResult {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    const explanation = value.explanation;
    return (
      isRecord(explanation) &&
      typeof explanation.professional === "string" &&
      typeof explanation.plain === "string"
    );
  }
  return value.ok === false && isExtensionError(value.error);
}

export function isConfigTestResult(value: unknown): value is ConfigTestResult {
  if (!isRecord(value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && isExtensionError(value.error);
}

function isSetupConfigResult(value: unknown): value is SetupConfigResult {
  return isAckResult(value);
}

export function isPublicConfigResult(value: unknown): value is PublicConfigResult {
  if (!isRecord(value)) return false;
  if (value.ok === true) {
    return typeof value.baseUrl === "string" && typeof value.model === "string";
  }
  return value.ok === false && isExtensionError(value.error);
}

function isAckResult(value: unknown): value is { ok: true } | { ok: false; error: ExtensionError } {
  if (!isRecord(value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && isExtensionError(value.error);
}

function isExtensionError(value: unknown): value is ExtensionError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function unexpected(): ExtensionError {
  return { code: "unknown", message: "出了点问题，请重试。" };
}

/** chrome 消息 API 本身是 any；返回 unknown，由各助手用响应守卫校验。 */
async function send(request: RuntimeRequest): Promise<unknown> {
  return chrome.runtime.sendMessage(request);
}

export async function requestExplainTerm(term: string, refresh = false): Promise<ExplainResult> {
  const response = await send(
    refresh
      ? { type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST, term, refresh: true }
      : { type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST, term },
  );
  return isExplainResult(response) ? response : { ok: false, error: unexpected() };
}

/**
 * 取消当前 frame 的在途解释（关闭卡片 / 换词时调用）。
 * 尽力而为：后台无响应或扩展上下文失效时直接忽略，请求会按超时自行结束。
 */
export async function requestCancelExplain(): Promise<void> {
  try {
    await send({ type: MESSAGE_TYPES.CANCEL_EXPLAIN_REQUEST });
  } catch {
    // 取消失败不影响主流程。
  }
}

export async function requestConfigTest(config: AiConfig): Promise<ConfigTestResult> {
  const response = await send({ type: MESSAGE_TYPES.CONFIG_TEST_REQUEST, config });
  return isConfigTestResult(response) ? response : { ok: false, error: unexpected() };
}

/** 卡片内配置：校验、测试连接、申请主机权限并落盘。失败返回稳定错误码 + 可读原因。 */
export async function requestSetupConfig(
  config: AiConfig,
  mode: SetupMode = "create",
): Promise<SetupConfigResult> {
  const response = await send(
    mode === "replace"
      ? { type: MESSAGE_TYPES.SETUP_CONFIG_REQUEST, config, mode: "replace" }
      : { type: MESSAGE_TYPES.SETUP_CONFIG_REQUEST, config },
  );
  return isSetupConfigResult(response)
    ? response
    : { ok: false, error: { code: "network", message: "暂时连不上，请刷新这个网页后再试。" } };
}

/** 读取已保存的地址和模型名，不含密钥。 */
export async function requestPublicConfig(): Promise<PublicConfigResult> {
  const response = await send({ type: MESSAGE_TYPES.PUBLIC_CONFIG_REQUEST });
  if (!isPublicConfigResult(response)) return { ok: false, error: unexpected() };
  if (!response.ok) return response;
  return { ok: true, baseUrl: response.baseUrl, model: response.model };
}

/** 为已保存的接口地址申请主机权限，不把密钥交给页面。 */
export async function requestGrantHostPermission(): Promise<SetupConfigResult> {
  const response = await send({ type: MESSAGE_TYPES.GRANT_HOST_PERMISSION_REQUEST });
  return isSetupConfigResult(response)
    ? response
    : { ok: false, error: { code: "network", message: "暂时连不上，请刷新这个网页后再试。" } };
}

/** 让后台打开设置页。content script 自己没有 openOptionsPage。 */
export async function requestOpenOptions(): Promise<void> {
  try {
    await send({ type: MESSAGE_TYPES.OPEN_OPTIONS_REQUEST });
  } catch {
    // 打不开时用户仍可点工具栏图标。
  }
}

// —— 发送方授权规则：与契约同住 ——

export function isOptionsPageSender(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? "";
  const origin = `chrome-extension://${chrome.runtime.id}/`;
  if (!url.startsWith(origin)) return false;
  const path = url.slice(origin.length).split("?")[0] ?? "";
  return path === "options.html";
}

export function isPageSender(sender: chrome.runtime.MessageSender): boolean {
  return /^https?:\/\//.test(sender.url ?? "");
}
