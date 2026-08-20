import type { AiConfig } from "../shared/messages";
import { requestConfigTest } from "../shared/messages";
import { deleteConfig, loadConfig, saveConfig, validateConfig } from "../shared/config";

// 元素来自项目自身固定的 options 页面结构；结构被改坏时由 E2E 兜底。
const form = document.querySelector<HTMLFormElement>("#config-form")!;
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url")!;
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key")!;
const modelInput = document.querySelector<HTMLInputElement>("#model")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const testButton = document.querySelector<HTMLButtonElement>("#test-connection")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const deleteButton = document.querySelector<HTMLButtonElement>("#delete-config")!;
const toggleKeyButton = document.querySelector<HTMLButtonElement>("#toggle-key")!;

let saveEligibleConfig: AiConfig | null = null;

async function init(): Promise<void> {
  const result = await loadConfig();
  if (result.ok) {
    saveEligibleConfig = result.config;
    baseUrlInput.value = result.config.baseUrl;
    apiKeyInput.value = result.config.apiKey;
    modelInput.value = result.config.model;
    deleteButton.hidden = false;
    setStatus("已保存配置。修改 Base URL、API Key 或 Model 后需要重新测试连接。", "info");
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
  };
}

function setStatus(text: string, tone: "info" | "ok" | "error"): void {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function refreshSaveAvailability(): void {
  const current = currentConfig();
  const unchanged =
    saveEligibleConfig !== null &&
    current.baseUrl === saveEligibleConfig.baseUrl &&
    current.apiKey === saveEligibleConfig.apiKey &&
    current.model === saveEligibleConfig.model;
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
      saveEligibleConfig = validation.config;
      refreshSaveAvailability();
      setStatus("连接测试成功，可以保存配置。", "ok");
    } else {
      saveEligibleConfig = null;
      refreshSaveAvailability();
      setStatus(response.error.message, "error");
    }
  } catch {
    saveEligibleConfig = null;
    refreshSaveAvailability();
    setStatus("无法连接扩展后台，请重新打开设置页。", "error");
  } finally {
    testButton.disabled = false;
  }
}

async function handleSave(event: Event): Promise<void> {
  event.preventDefault();
  if (!saveEligibleConfig) {
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
  saveEligibleConfig = null;
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
  saveEligibleConfig = null;
  refreshSaveAvailability();
}

testButton.addEventListener("click", () => void handleTestConnection());
form.addEventListener("submit", (event) => void handleSave(event));
deleteButton.addEventListener("click", () => void handleDelete());
toggleKeyButton.addEventListener("click", handleToggleKey);
for (const input of [baseUrlInput, apiKeyInput, modelInput]) {
  input.addEventListener("input", handleFieldChange);
}

void init();
