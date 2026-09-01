import type { AiConfig } from "./messages.ts";
import { isRecord } from "./guard.ts";

export const CONFIG_STORAGE_KEY = "aiConfig";
/** 旧版「恢复划词」开关的独立存储键；功能已始终开启，启动时删除遗留值。 */
export const LEGACY_RESTORE_SELECTION_STORAGE_KEY = "restoreSelection";

/**
 * 规范化 Base URL：去尾斜杠，只允许 https；
 * 本地调试例外允许 http://localhost 与 http://127.0.0.1。
 */
export function normalizeBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url = raw.trim();
  if (url.length === 0) return null;
  url = url.replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // 不接受 query/hash：后续会拼接 /chat/completions，query 会破坏地址。
  if (parsed.search !== "" || parsed.hash !== "") return null;

  if (parsed.protocol === "https:") return url;
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1") return url;
  }
  return null;
}

export type ConfigValidationResult =
  { ok: true; config: AiConfig } | { ok: false; message: string };

/** 校验并规范化配置；外部输入在可信边界重新校验，不依赖 TypeScript 类型。 */
export function validateConfig(raw: unknown): ConfigValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, message: "配置不完整，请重新填写。" };
  }
  const value = raw;

  const baseUrl = normalizeBaseUrl(value.baseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      message: "接口地址无效，请重新填写。",
    };
  }

  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (apiKey.length === 0) {
    return { ok: false, message: "请填写密钥。" };
  }

  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (model.length === 0) {
    return { ok: false, message: "请填写模型名称。" };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      apiKey,
      model,
    },
  };
}

/** 配置读取结果：区分「从未保存」与「存储损坏/被篡改」。 */
export type ConfigLoadResult =
  | { ok: true; config: AiConfig }
  | { ok: false; reason: "absent" }
  | { ok: false; reason: "invalid"; message: string };

/**
 * 读路径即完整校验：任何读取配置的地方都经过 validateConfig，
 * 坏配置返回 invalid（带用户可读消息），不再被误报为「尚未配置」。
 */
export async function loadConfig(): Promise<ConfigLoadResult> {
  const data = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  const raw = data[CONFIG_STORAGE_KEY];
  if (raw === undefined) return { ok: false, reason: "absent" };
  const validation = validateConfig(raw);
  if (!validation.ok) {
    return { ok: false, reason: "invalid", message: validation.message };
  }
  return { ok: true, config: validation.config };
}

/** 校验后落盘：非法配置拒绝写入并抛错，调用方应先 validateConfig。 */
export async function saveConfig(config: AiConfig): Promise<void> {
  const validation = validateConfig(config);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: validation.config });
}

export async function deleteConfig(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_STORAGE_KEY);
}

/** 已有有效配置时卡片内配置不再允许覆盖；换配置必须走设置页。 */
export const CONFIG_LOCKED_MESSAGE =
  "已保存过接口配置。如需更换，请点工具栏的 Aside 图标，在设置页里修改。";

/**
 * 卡片内配置只在「当前没有有效配置」时允许：
 * 首次配置（absent）或覆盖损坏配置（invalid）。
 * 有效配置一旦存在，任意页面 frame 都不能再静默改写计费去向与密钥。
 */
export function allowsCardSetup(existing: ConfigLoadResult): boolean {
  return !existing.ok;
}

export async function dropLegacyRestoreSelectionSetting(): Promise<void> {
  await chrome.storage.local.remove(LEGACY_RESTORE_SELECTION_STORAGE_KEY);
  const data = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
  const raw = data[CONFIG_STORAGE_KEY];
  if (!isRecord(raw) || Array.isArray(raw)) return;
  const stored = raw;
  if (!("restoreSelection" in stored)) return;
  const rest = { ...stored };
  delete rest.restoreSelection;
  await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: rest });
}

/**
 * 将 storage.local 的访问级别限制为受信任扩展上下文，
 * 避免 content script（不受信任上下文）直接读取配置与 API Key。
 * 旧版 Chrome 不支持时降级：content script 代码本身从不读取 storage.local。
 */
export async function restrictStorageAccessLevel(): Promise<void> {
  const area = chrome.storage.local as unknown as {
    setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
  };
  if (typeof area.setAccessLevel !== "function") return;
  try {
    await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // 忽略：低版本平台不支持时按代码约束兜底。
  }
}
