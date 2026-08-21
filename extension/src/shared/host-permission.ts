/** 将已校验的 Base URL 转成 chrome.permissions 所需的 origin 匹配模式。 */
export function originPatternFromBaseUrl(baseUrl: string): string | null {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return `${parsed.origin}/*`;
  } catch {
    return null;
  }
}

const MISSING_PERMISSION_MESSAGE =
  "尚未授权访问该接口地址。请打开设置页，测试连接并在浏览器提示中允许。";

export function hostPermissionError(): { code: "host_permission"; message: string } {
  return { code: "host_permission", message: MISSING_PERMISSION_MESSAGE };
}

/**
 * 查询扩展是否已获得对该接口 origin 的访问权限。
 * 测试环境没有 chrome.permissions 时视为已授权，避免拖垮离线 HTTP 单测。
 */
export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return false;
  const api = globalThis.chrome?.permissions;
  if (typeof api?.contains !== "function") return true;
  return api.contains({ origins: [pattern] });
}

/**
 * 在用户手势中申请对该接口 origin 的访问权限（测试连接 / 保存）。
 * 用户拒绝或 API 不可用时返回 false。
 */
export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return false;
  const api = globalThis.chrome?.permissions;
  if (typeof api?.contains !== "function") return true;
  if (await api.contains({ origins: [pattern] })) return true;
  if (typeof api.request !== "function") return false;
  return api.request({ origins: [pattern] });
}
