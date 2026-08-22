import type { AiConfig } from "../shared/messages";
import { requestConfigTest } from "../shared/messages";
import {
  deleteConfig,
  loadConfig,
  saveConfig,
  validateConfig,
} from "../shared/config";
import { ensureHostPermission } from "../shared/host-permission";

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
    setStatus("已保存。若改了地址、密钥或模型，需要重新测试连接。", "info");
  } else if (result.reason === "invalid") {
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
    const granted = await ensureHostPermission(validation.config.baseUrl);
    if (!granted) {
      saveEligibleConfig = null;
      refreshSaveAvailability();
      setStatus("需要允许访问这个地址，才能测试和解释。请在浏览器提示里选择允许。", "error");
      return;
    }

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
    setStatus("暂时连不上，请关掉这个页面再打开试试。", "error");
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
  setStatus("已清除保存的接口信息。", "info");
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
