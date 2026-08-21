/** 解释入口只接受真实用户手势，避免页面脚本合成 click 消耗 API Key。 */
export function isTrustedOverlayClick(event: Event, trigger: EventTarget, host?: EventTarget): boolean {
  if (!event.isTrusted) return false;
  const path = event.composedPath();
  // closed shadow 会对外把路径收口到 host；open shadow 仍能看到 trigger。
  return path.includes(trigger) || (host !== undefined && path.includes(host));
}
