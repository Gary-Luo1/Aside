import {
  isConfigTestRequest,
  isExplainTermRequest,
  isOptionsPageSender,
  isPageSender,
  isUiSettingsRequest,
  type ExtensionError,
} from "../shared/messages";
import { sanitizeTerm } from "../shared/term";
import { loadConfig, restrictStorageAccessLevel, validateConfig } from "../shared/config";
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
        error: { code: "invalid_term", message: "请选择一个短名词（1-60 个字符）。" },
      };
    }
    return coordinator.explain(term, sender.tab?.id, sender.frameId);
  }

  if (isUiSettingsRequest(message)) {
    if (!isPageSender(sender)) return undefined;
    const configResult = await loadConfig();
    // 只返回内容脚本所需的 UI 设置，不携带 API Key / Base URL / Model。
    return {
      ok: true,
      restoreSelection: configResult.ok ? configResult.config.restoreSelection === true : false,
    };
  }

  return undefined;
}

function toUnknownError(): ExtensionError {
  return { code: "unknown", message: "发生未知错误，请重试。" };
}
