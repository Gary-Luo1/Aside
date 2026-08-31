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
  "network",
  "auth",
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
  SETUP_CONFIG_REQUEST: "SETUP_CONFIG_REQUEST",
} as const;

/** content/options → 后台 的请求；载荷在后台可信边界重新校验。 */
export type RuntimeRequest =
  | { type: typeof MESSAGE_TYPES.CONFIG_TEST_REQUEST; config: AiConfig }
  | { type: typeof MESSAGE_TYPES.EXPLAIN_TERM_REQUEST; term: string }
  | { type: typeof MESSAGE_TYPES.SETUP_CONFIG_REQUEST; config: AiConfig };

/** 后台对解释请求的稳定响应。 */
export type ExplainResult =
  { ok: true; explanation: Explanation } | { ok: false; error: ExtensionError };

/** 后台对连接测试请求的稳定响应。 */
export type ConfigTestResult = { ok: true } | { ok: false; error: ExtensionError };

/** 后台对「卡片内配置」保存请求的稳定响应。 */
export type SetupConfigResult = { ok: true } | { ok: false; message: string };

// —— 载荷守卫：后台在可信边界按具体类型分发，不再只信 type 字符串 ——

export function isExplainTermRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.EXPLAIN_TERM_REQUEST; term: string } {
  return (
    isRecord(value) &&
    value.type === MESSAGE_TYPES.EXPLAIN_TERM_REQUEST &&
    typeof value.term === "string"
  );
}

export function isConfigTestRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.CONFIG_TEST_REQUEST; config: AiConfig } {
  return (
    isRecord(value) && value.type === MESSAGE_TYPES.CONFIG_TEST_REQUEST && isRecord(value.config)
  );
}

export function isSetupConfigRequest(
  value: unknown,
): value is { type: typeof MESSAGE_TYPES.SETUP_CONFIG_REQUEST; config: AiConfig } {
  return (
    isRecord(value) && value.type === MESSAGE_TYPES.SETUP_CONFIG_REQUEST && isRecord(value.config)
  );
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
  if (!isRecord(value)) return false;
  if (value.ok === true) return true;
  return value.ok === false && typeof value.message === "string";
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

export async function requestExplainTerm(term: string): Promise<ExplainResult> {
  const response = await send({ type: MESSAGE_TYPES.EXPLAIN_TERM_REQUEST, term });
  return isExplainResult(response) ? response : { ok: false, error: unexpected() };
}

export async function requestConfigTest(config: AiConfig): Promise<ConfigTestResult> {
  const response = await send({ type: MESSAGE_TYPES.CONFIG_TEST_REQUEST, config });
  return isConfigTestResult(response) ? response : { ok: false, error: unexpected() };
}

/** 卡片内配置：校验、申请主机权限并落盘。失败返回用户可读的原因。 */
export async function requestSetupConfig(config: AiConfig): Promise<SetupConfigResult> {
  const response = await send({ type: MESSAGE_TYPES.SETUP_CONFIG_REQUEST, config });
  return isSetupConfigResult(response)
    ? response
    : { ok: false, message: "暂时连不上，请刷新这个网页后再试。" };
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
