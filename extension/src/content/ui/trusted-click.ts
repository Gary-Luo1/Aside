/** 解释入口只接受真实用户手势，避免页面脚本合成 click 消耗 API Key。 */
export interface OverlayClickContext {
  host?: EventTarget;
  root?: Pick<ShadowRoot, "elementFromPoint" | "activeElement">;
}

export function isTrustedOverlayClick(
  event: Event,
  trigger: EventTarget,
  context?: OverlayClickContext,
): boolean {
  if (!event.isTrusted) return false;
  const path = event.composedPath();
  if (path.includes(trigger)) return true;

  const host = context?.host;
  if (host === undefined || !path.includes(host)) return false;
  if (!(trigger instanceof Element)) return false;

  const root = context?.root;
  // closed shadow 对外把路径收口到 host。键盘激活（Enter/Space）产生 detail=0 的 click，
  // 坐标常是 (0,0)，不能拿来做命中；只认 shadow 内焦点是不是入口。
  if (clickDetail(event) === 0) return root?.activeElement === trigger;

  const point = clickPoint(event);
  if (!point || !root?.elementFromPoint) return false;
  const hit = root.elementFromPoint(point.x, point.y);
  return hit === trigger || (hit !== null && trigger.contains(hit));
}

function clickDetail(event: Event): number | undefined {
  const value = (event as MouseEvent).detail;
  return typeof value === "number" ? value : undefined;
}

function clickPoint(event: Event): { x: number; y: number } | null {
  const mouse = event as MouseEvent;
  if (typeof mouse.clientX !== "number" || typeof mouse.clientY !== "number") return null;
  return { x: mouse.clientX, y: mouse.clientY };
}
