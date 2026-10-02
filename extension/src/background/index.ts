import {
  isCancelExplainRequest,
  isConfigTestRequest,
  isExplainTermRequest,
  isGrantHostPermissionRequest,
  isOpenOptionsRequest,
  isOptionsPageSender,
  isPageSender,
  isPublicConfigRequest,
  isSetupConfigRequest,
  type ExtensionError,
  type PublicConfigResult,
  type SetupConfigResult,
  type SetupMode,
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
    return coordinator.explain(term, sender.tab?.id, sender.frameId, {
      refresh: message.refresh === true,
    });
  }

  if (isCancelExplainRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    coordinator.cancel(sender.tab?.id, sender.frameId);
    return { ok: true };
  }

  if (isSetupConfigRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    return handleSetupConfig(message.config, message.mode === "replace" ? "replace" : "create");
  }

  if (isPublicConfigRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    return handlePublicConfig();
  }

  if (isGrantHostPermissionRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    return handleGrantHostPermission();
  }

  if (isOpenOptionsRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }

  return undefined;
}

/**
 * 卡片内配置：校验 → 锁定检查 → 申请主机权限 → 连接测试 → 落盘。
 * create 在已有有效配置时拒绝，避免任意 frame 静默改写。
 * replace 只来自用户在认证/模型错误卡片里提交的表单，并且测试失败不会写入。
 * 权限申请需要用户手势；拿不到手势时返回引导用户去设置页的提示，不静默失败。
 */
async function handleSetupConfig(raw: unknown, mode: SetupMode): Promise<SetupConfigResult> {
  const validation = validateConfig(raw);
  if (!validation.ok) {
    return { ok: false, error: { code: "invalid_config", message: validation.message } };
  }

  const existing = await loadConfig();
  if (mode === "create" && !allowsCardSetup(existing)) {
    return { ok: false, error: { code: "config_locked", message: CONFIG_LOCKED_MESSAGE } };
  }

  const granted = await ensureHostPermission(validation.config.baseUrl);
  if (!granted) {
    return {
      ok: false,
      error: { code: "host_permission", message: PERMISSION_NEEDS_OPTIONS_MESSAGE },
    };
  }

  const test = await testConnection(validation.config);
  if (!test.ok) return { ok: false, error: test.error };

  try {
    await saveConfig(validation.config);
    return { ok: true };
  } catch {
    return { ok: false, error: { code: "unknown", message: "保存失败，请稍后再试。" } };
  }
}

/** 卡片预填用。只返回地址和模型名。 */
async function handlePublicConfig(): Promise<PublicConfigResult> {
  const existing = await loadConfig();
  if (!existing.ok) {
    if (existing.reason === "absent") {
      return {
        ok: false,
        error: { code: "unconfigured", message: "还没有填写模型接口，请先打开设置。" },
      };
    }
    return { ok: false, error: { code: "invalid_config", message: existing.message } };
  }
  return { ok: true, baseUrl: existing.config.baseUrl, model: existing.config.model };
}

/** 已有配置但还没授权时，按存储里的地址申请权限，不把密钥发回页面。 */
async function handleGrantHostPermission(): Promise<SetupConfigResult> {
  const existing = await loadConfig();
  if (!existing.ok) {
    if (existing.reason === "absent") {
      return {
        ok: false,
        error: { code: "unconfigured", message: "还没有填写模型接口，请先打开设置。" },
      };
    }
    return { ok: false, error: { code: "invalid_config", message: existing.message } };
  }
  const granted = await ensureHostPermission(existing.config.baseUrl);
  if (!granted) {
    return {
      ok: false,
      error: { code: "host_permission", message: PERMISSION_NEEDS_OPTIONS_MESSAGE },
    };
  }
  return { ok: true };
}

function toUnknownError(): ExtensionError {
  return { code: "unknown", message: "出了点问题，请重试。" };
}
