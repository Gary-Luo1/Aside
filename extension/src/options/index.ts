import type { AiConfig } from "../shared/messages";
import { requestConfigTest } from "../shared/messages";
import { deleteConfig, loadConfig, saveConfig, validateConfig } from "../shared/config";

// 元素来自项目自身固定的 options 页面结构；结构被改坏时由 E2E 兜底。
const form = document.querySelector<HTMLFormElement>("#config-form")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key")!;
const modelInput = document.querySelector<HTMLInputElement>("#model")!;
const restoreSelectionInput = document.querySelector<HTMLInputElement>("#restore-selection")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const testButton = document.querySelector<HTMLButtonElement>("#test-connection")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete-config")!;
const toggleKeyButton = document.querySelector<HTMLButtonElement>("#toggle-key")!;

let lastTestedConfig: AiConfig | null = null;

async function init(): Promise<void> {
  const result = await loadConfig();
  if (result.ok) {
    baseUrlInput.value = result.config.baseUrl;
    apiKeyInput.value = result.config.apiKey;
    modelInput.value = result.config.model;
    restoreSelectionInput.checked = result.config.restoreSelection === true;
    deleteButton.hidden = false;
    setStatus("已保存配置。修改任一字段后需要重新测试连接。", "info");
  } else if (result.reason === "invalid") {
    // 存储损坏/被篡改：明确提示「配置无效」而不是误报「尚未配置」，保留删除入口便于清理。
    deleteButton.hidden = false;
    setStatus(result.message, "error");
  } else {
    deleteButton.hidden = true;
  }
  refreshSaveAvailability();
}

function currentConfig(): AiConfig {
  return {
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value,
    model: modelInput.value.trim(),
    restoreSelection: restoreSelectionInput.checked,
  };
}

function setStatus(text: string, tone: "info" | "ok" | "error"): void {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function refreshSaveAvailability(): void {
  const current = currentConfig();
  const unchanged =
    lastTestedConfig !== null &&
    current.baseUrl === lastTestedConfig.baseUrl &&
    current.apiKey === lastTestedConfig.apiKey &&
    current.model === lastTestedConfig.model;
  saveButton.disabled = !unchanged;
}

async function handleTestConnection(): Promise<void> {
  const validation = validateConfig(currentConfig());
  if (!validation.ok) {
    setStatus(validation.message, "error");
    return;
  }

  testButton.disabled = true;
  setStatus("正在测试连接…", "info");
  try {
    const response = await requestConfigTest(validation.config);

    if (response.ok) {
      lastTestedConfig = validation.config;
      refreshSaveAvailability();
      setStatus("连接测试成功，可以保存配置。", "ok");
    } else {
      lastTestedConfig = null;
      refreshSaveAvailability();
      setStatus(response.error.message, "error");
    }
  } catch {
    lastTestedConfig = null;
    refreshSaveAvailability();
    setStatus("无法连接扩展后台，请重新打开设置页。", "error");
  } finally {
    testButton.disabled = false;
  }
}

async function handleSave(event: Event): Promise<void> {
  event.preventDefault();
  if (!lastTestedConfig) {
    setStatus("请先测试连接，成功后再保存。", "error");
    return;
  }
  const validation = validateConfig(currentConfig());
  if (!validation.ok) {
    setStatus(validation.message, "error");
    return;
  }
  await saveConfig(validation.config);
  deleteButton.hidden = false;
  setStatus("配置已保存。", "ok");
}

async function handleDelete(): Promise<void> {
  await deleteConfig();
  baseUrlInput.value = "";
  apiKeyInput.value = "";
  modelInput.value = "";
  restoreSelectionInput.checked = false;
  lastTestedConfig = null;
  deleteButton.hidden = true;
  refreshSaveAvailability();
  setStatus("已删除 API Base URL、API Key 和 Model，本地配置已清空。", "info");
}

function handleToggleKey(): void {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  toggleKeyButton.textContent = reveal ? "隐藏" : "显示";
}

function handleFieldChange(): void {
  lastTestedConfig = null;
  refreshSaveAvailability();
}

testButton.addEventListener("click", () => void handleTestConnection());
form.addEventListener("submit", (event) => void handleSave(event));
deleteButton.addEventListener("click", () => void handleDelete());
toggleKeyButton.addEventListener("click", handleToggleKey);
for (const input of [baseUrlInput, apiKeyInput, modelInput]) {
  input.addEventListener("input", handleFieldChange);
}
// 开关不涉及接口参数，切换后无需重新测试连接。
restoreSelectionInput.addEventListener("change", () => refreshSaveAvailability());

void init();
