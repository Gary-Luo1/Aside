import type { AiConfig } from "../shared/messages.ts";
import { requestConfigTest } from "../shared/messages.ts";
import { deleteConfig, loadConfig, saveConfig, validateConfig } from "../shared/config.ts";
import { ensureHostPermission } from "../shared/host-permission.ts";

// 元素来自项目自身固定的 options 页面结构；缺失时立即抛出可读错误，而不是静默拿到 null。
function mustGet<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`设置页缺少元素：${selector}`);
  return el;
}

const form = mustGet<HTMLFormElement>("#config-form");
const baseUrlInput = mustGet<HTMLInputElement>("#base-url");
const apiKeyInput = mustGet<HTMLInputElement>("#api-key");
const modelInput = mustGet<HTMLInputElement>("#model");
const statusEl = mustGet<HTMLElement>("#status");
const testButton = mustGet<HTMLButtonElement>("#test-connection");
const saveButton = mustGet<HTMLButtonElement>("#save");
const deleteButton = mustGet<HTMLButtonElement>("#delete-config");
const toggleKeyButton = mustGet<HTMLButtonElement>("#toggle-key");

/** 连接测试的兜底超时：后台无响应时也要把按钮还给用户。 */
const TEST_TIMEOUT_MS = 20_000;

/**
 * 最近一次「测试连接」通过的配置。
 * 只有与它完全一致的输入才允许保存 —— 改了地址、密钥或模型就必须重新测试。
 */
let testedConfig: AiConfig | null = null;

async function init(): Promise<void> {
  try {
    const result = await loadConfig();
    if (result.ok) {
      testedConfig = result.config;
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
  } catch {
    setStatus("读取保存的配置失败，请关掉这个页面再打开试试。", "error");
  }
  refreshSaveAvailability();
}

function currentConfig(): AiConfig {
  return {
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
  };
}

function setStatus(text: string, tone: "info" | "ok" | "error"): void {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function refreshSaveAvailability(): void {
  const current = currentConfig();
  const matchesTestedConfig =
    testedConfig !== null &&
    current.baseUrl === testedConfig.baseUrl &&
    current.apiKey === testedConfig.apiKey &&
    current.model === testedConfig.model;
  saveButton.disabled = !matchesTestedConfig;
}

/** 后台卡住时 Promise.race 兜底，避免用户永远停在「正在测试连接…」。 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
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
      testedConfig = null;
      refreshSaveAvailability();
      setStatus("需要允许访问这个地址，才能测试和解释。请在浏览器提示里选择允许。", "error");
      return;
    }

    const response = await withTimeout(
      requestConfigTest(validation.config),
      TEST_TIMEOUT_MS,
      "测试超时，请稍后再试。",
    );

    if (response.ok) {
      testedConfig = validation.config;
      refreshSaveAvailability();
      setStatus("连接测试成功，可以保存配置。", "ok");
    } else {
      testedConfig = null;
      refreshSaveAvailability();
      setStatus(response.error.message, "error");
    }
  } catch (error) {
    testedConfig = null;
    refreshSaveAvailability();
    setStatus(
      error instanceof Error ? error.message : "暂时连不上，请关掉这个页面再打开试试。",
      "error",
    );
  } finally {
    testButton.disabled = false;
  }
}

async function handleSave(event: Event): Promise<void> {
  event.preventDefault();
  if (!testedConfig) {
    setStatus("请先测试连接，成功后再保存。", "error");
    return;
  }
  try {
    // saveConfig 内部会再次校验，非法配置直接抛出用户可读的原因。
    await saveConfig(currentConfig());
    deleteButton.hidden = false;
    setStatus("配置已保存。", "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "保存失败，请稍后再试。", "error");
  }
}

async function handleDelete(): Promise<void> {
  try {
    await deleteConfig();
    baseUrlInput.value = "";
    apiKeyInput.value = "";
    modelInput.value = "";
    testedConfig = null;
    deleteButton.hidden = true;
    refreshSaveAvailability();
    setStatus("已清除保存的接口信息。", "info");
  } catch {
    setStatus("清除失败，请稍后再试。", "error");
  }
}

function handleToggleKey(): void {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  toggleKeyButton.textContent = reveal ? "隐藏" : "显示";
}

function handleFieldChange(): void {
  testedConfig = null;
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
