import {
  isConfigTestRequest,
  isExplainTermRequest,
  isGetSettingsRequest,
  isOptionsPageSender,
  isPageSender,
  MESSAGE_TYPES,
  type ExtensionError,
} from "../shared/messages";
import { INVALID_TERM_HINT, sanitizeTerm } from "../shared/term";
import {
  loadConfig,
  loadRestoreSelection,
  RESTORE_SELECTION_STORAGE_KEY,
  restrictStorageAccessLevel,
  validateConfig,
} from "../shared/config";
import { explainTerm, testConnection } from "./api-client";
import { ExplanationCoordinator } from "./explanation-coordinator";

/** 解释请求统一交给协调模块：新请求自动中止同一 frame 的旧请求，避免重复计费。 */
const coordinator = new ExplanationCoordinator({ loadConfig, explain: explainTerm });

// 安装时唤醒 service worker（MV3 惰性启动），也让 E2E 能稳定拿到扩展 id。
chrome.runtime.onInstalled.addListener(async () => {
  await restrictStorageAccessLevel();
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const change = changes[RESTORE_SELECTION_STORAGE_KEY];
  if (!change) return;
  void notifyRestoreSelectionChanged(change.newValue === true);
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

async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (isGetSettingsRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    return { ok: true, restoreSelection: await loadRestoreSelection() };
  }

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

  return undefined;
}

function toUnknownError(): ExtensionError {
  return { code: "unknown", message: "出了点问题，请重试。" };
}

async function notifyRestoreSelectionChanged(restoreSelection: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const payload = {
    type: MESSAGE_TYPES.RESTORE_SELECTION_CHANGED,
    restoreSelection,
  };
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try {
        await chrome.tabs.sendMessage(tab.id, payload);
      } catch {
        // 无内容脚本的标签页（设置页、内部页等）会失败，忽略即可。
      }
    }),
  );
}
