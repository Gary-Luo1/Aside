import type { AiConfig } from "./messages";

export const CONFIG_STORAGE_KEY = "aiConfig";
export const RESTORE_SELECTION_STORAGE_KEY = "restoreSelection";

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
  | { ok: true; config: AiConfig }
  | { ok: false; message: string };

/** 校验并规范化配置；外部输入在可信边界重新校验，不依赖 TypeScript 类型。 */
export function validateConfig(raw: unknown): ConfigValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, message: "配置不完整，请重新填写。" };
  }
  const value = raw as Record<string, unknown>;

  const baseUrl = normalizeBaseUrl(value.baseUrl);
  if (!baseUrl) {
    return {
      ok: false,
      message: "Base URL 无效：请填写模型厂商提供的官方接口地址，并以 https 开头。",
    };
  }

  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
  if (apiKey.length === 0) {
    return { ok: false, message: "请填写 API Key。" };
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

/** 恢复划词默认关闭；旧配置里嵌在 aiConfig 的 true 会迁移到独立键。 */
export async function loadRestoreSelection(): Promise<boolean> {
  const data = await chrome.storage.local.get([RESTORE_SELECTION_STORAGE_KEY, CONFIG_STORAGE_KEY]);
  const dedicated = data[RESTORE_SELECTION_STORAGE_KEY];
  if (typeof dedicated === "boolean") return dedicated;

  const raw = data[CONFIG_STORAGE_KEY];
  const migrated =
    typeof raw === "object" &&
    raw !== null &&
    (raw as { restoreSelection?: unknown }).restoreSelection === true;
  await chrome.storage.local.set({ [RESTORE_SELECTION_STORAGE_KEY]: migrated });
  return migrated;
}

export async function saveRestoreSelection(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [RESTORE_SELECTION_STORAGE_KEY]: enabled });
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
