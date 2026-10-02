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
  "还没有允许访问这个地址。请打开设置，点测试连接，并在浏览器提示里选择允许。";

export function hostPermissionError(): { code: "host_permission"; message: string } {
  return { code: "host_permission", message: MISSING_PERMISSION_MESSAGE };
}

/**
 * 查询扩展是否已获得对该接口 origin 的访问权限。
 * 没有 chrome.permissions API 时视为已授权（非扩展运行环境）。
 */
export async function hasHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return false;
  const api = globalThis.chrome?.permissions;
  if (typeof api?.contains !== "function") return true;
  return api.contains({ origins: [pattern] });
}

/** 权限被拒且无法在扩展上下文中完成授权时的提示，供 UI 直接展示。 */
export const PERMISSION_NEEDS_OPTIONS_MESSAGE =
  "浏览器要求你在设置页里完成授权。请点工具栏的 Aside 图标，填好后点「测试连接」并选择允许。";

/**
 * 在用户手势仍有效的同步调用栈里发起主机权限申请，并返回尚未结算的 Promise。
 *
 * chrome.permissions.request 只认调用那一刻的手势。卡片保存要先经过
 * content script → service worker，再 await 读存储或查 contains，手势就没了，
 * 浏览器会直接拒绝。调用方必须在点击或 onMessage 的同步段调用本函数，
 * 之后再 await 结果。已经授权时不会再弹窗。
 */
export function beginHostPermissionRequest(baseUrl: string): Promise<boolean> {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return Promise.resolve(false);
  const api = globalThis.chrome?.permissions;
  if (typeof api?.contains !== "function") return Promise.resolve(true);
  if (typeof api.request !== "function") return Promise.resolve(false);
  try {
    return Promise.resolve(api.request({ origins: [pattern] })).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * 没有手势可保留时的申请（例如已离开点击栈的授权按钮）。
 * 能同步申请的路径应使用 beginHostPermissionRequest。
 */
export async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPatternFromBaseUrl(baseUrl);
  if (!pattern) return false;
  const api = globalThis.chrome?.permissions;
  if (typeof api?.contains !== "function") return true;
  if (await api.contains({ origins: [pattern] })) return true;
  return beginHostPermissionRequest(baseUrl);
}
