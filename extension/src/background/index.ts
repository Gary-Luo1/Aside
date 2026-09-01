import {
  isCancelExplainRequest,
  isConfigTestRequest,
  isExplainTermRequest,
  isOptionsPageSender,
  isPageSender,
  isSetupConfigRequest,
  type ExtensionError,
  type SetupConfigResult,
} from "../shared/messages.ts";
import { INVALID_TERM_HINT, sanitizeTerm } from "../shared/term.ts";
import {
  allowsCardSetup,
  CONFIG_LOCKED_MESSAGE,
  dropLegacyRestoreSelectionSetting,
  loadConfig,
  restrictStorageAccessLevel,
  saveConfig,
  validateConfig,
} from "../shared/config.ts";
import {
  PERMISSION_NEEDS_OPTIONS_MESSAGE,
  ensureHostPermission,
} from "../shared/host-permission.ts";
import { explainTerm, testConnection } from "./api-client.ts";
import { ExplanationCoordinator } from "./explanation-coordinator.ts";

/** 解释请求统一交给协调模块：新请求自动中止同一 frame 的旧请求，避免重复计费。 */
const coordinator = new ExplanationCoordinator({ loadConfig, explain: explainTerm });

/** 迁移只需跑一次；标记命中即跳过，避免每次 service worker 唤醒都读写 storage。 */
const MIGRATION_DONE_KEY = "migration:storageAccessLevelRestricted";

async function runMigrations(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(MIGRATION_DONE_KEY);
    if (data[MIGRATION_DONE_KEY] === true) return;
    await restrictStorageAccessLevel();
    await dropLegacyRestoreSelectionSetting();
    await chrome.storage.local.set({ [MIGRATION_DONE_KEY]: true });
  } catch {
    // 存储不可用时忽略：迁移只影响遗留数据，不影响解释功能。
  }
}

// 安装/更新时唤醒 service worker（MV3 惰性启动）。
chrome.runtime.onInstalled.addListener(() => void runMigrations());

// 兼容从更旧版本升级、onInstalled 未覆盖到的场景；命中标记后立即返回。
void runMigrations();

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    void handleMessage(message, sender)
      .then(sendResponse)
      .catch(() => {
        // 失败原因通过稳定的用户可读错误返回，不写日志、不暴露内部细节。
        sendResponse({ ok: false, error: toUnknownError() });
      });
    return true; // 异步响应
  },
);

async function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (isConfigTestRequest(message)) {
    if (!isOptionsPageSender(sender)) return undefined;
    const validation = validateConfig(message.config);
    if (!validation.ok) {
      return { ok: false, error: { code: "invalid_config", message: validation.message } };
    }
    const result = await testConnection(validation.config);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  if (isExplainTermRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    const term = sanitizeTerm(message.term);
    if (term === null) {
      return {
        ok: false,
        error: { code: "invalid_term", message: INVALID_TERM_HINT },
      };
    }
    return coordinator.explain(term, sender.tab?.id, sender.frameId);
  }

  if (isCancelExplainRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    coordinator.cancel(sender.tab?.id, sender.frameId);
    return { ok: true };
  }

  if (isSetupConfigRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    return handleSetupConfig(message.config);
  }

  return undefined;
}

/**
 * 卡片内配置：校验 → 配置锁定检查 → 申请主机权限 → 落盘。
 * 已有有效配置时拒绝页面侧改写，防止任意 frame 把计费与划词记录重定向到别的密钥。
 * 权限申请需要用户手势；拿不到手势时返回引导用户去设置页的提示，不静默失败。
 */
async function handleSetupConfig(raw: unknown): Promise<SetupConfigResult> {
  const validation = validateConfig(raw);
  if (!validation.ok) {
    return { ok: false, error: { code: "invalid_config", message: validation.message } };
  }

  const existing = await loadConfig();
  if (!allowsCardSetup(existing)) {
    return { ok: false, error: { code: "config_locked", message: CONFIG_LOCKED_MESSAGE } };
  }

  const granted = await ensureHostPermission(validation.config.baseUrl);
  if (!granted) {
    return {
      ok: false,
      error: { code: "host_permission", message: PERMISSION_NEEDS_OPTIONS_MESSAGE },
    };
  }

  try {
    await saveConfig(validation.config);
    return { ok: true };
  } catch {
    return { ok: false, error: { code: "unknown", message: "保存失败，请稍后再试。" } };
  }
}

function toUnknownError(): ExtensionError {
  return { code: "unknown", message: "出了点问题，请重试。" };
}
