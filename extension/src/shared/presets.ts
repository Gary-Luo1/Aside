/** 卡片和设置页共用的接口示例。只填地址和模型，密钥始终由用户自己填写。 */
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
  },
  {
    id: "qwen",
    label: "通义",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  {
    id: "zhipu",
    label: "智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
];
