/**
 * 在禁止选择的网页（如开启防复制的飞书文档）上，按用户手势恢复文本选择。
 *
 * 仅在用户在“包含文本且 user-select: none”的内容上按下鼠标时生效：
 * 把该内容所在的不可选区域临时标记为可选中（样式带 !important，
 * 与站点规则一致地作用于整块内容），随后浏览器原生拖选即可工作。
 * 不复制、不读取、不发送任何未选中内容。
 */

import { isRecord } from "../shared/guard.ts";

const STYLE_ID = "aside-selectable-style";
const SELECTABLE_ATTR = "data-aside-selectable";

/** 文本扫描的节点预算：超出按「有文本」保守处理，避免大子树拖慢每次按下。 */
const TEXT_SCAN_NODE_BUDGET = 64;

/** 结构化扫描的最小节点形状：Text 节点带 data，容器带 childNodes。 */
interface TextScanNode {
  data?: unknown;
  childNodes?: ArrayLike<unknown>;
}

/**
 * 判断子树里是否有非空白文本，只访问预算内的节点。
 * 超预算返回 true：误报只会多走一次 user-select 判断（通常立即短路），不会改错 DOM。
 */
export function containsNonSpaceText(root: TextScanNode, budget = TEXT_SCAN_NODE_BUDGET): boolean {
  if (typeof root.data === "string" && root.data.trim().length > 0) return true;
  const children = root.childNodes;
  if (children === undefined) return false;
  for (let i = 0; i < children.length; i += 1) {
    if (budget <= 0) return true;
    budget -= 1;
    const child = children[i];
    if (isRecord(child) && containsNonSpaceText(child, budget)) return true;
  }
  return false;
}

export class ProtectedSelectionRestorer {
  private attached = false;
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onPointerEnd = () => {
    // 等本次 pointerup 冒泡结束再摘掉标记，避免 user-select 立刻改回 none 把刚完成的选区清掉。
    window.setTimeout(() => this.clearSelectableMarks(), 0);
  };

  attach(): void {
    if (this.attached) return;
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("pointerup", this.onPointerEnd, true);
    document.addEventListener("pointercancel", this.onPointerEnd, true);
    this.attached = true;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return; // 仅左键拖选
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.isInteractive(target)) return;

    const textElement = this.findTextElement(target);
    if (!textElement) return;
    const region = this.findBlockedRegion(textElement);
    if (!region) return;

    this.ensureStyle();
    region.setAttribute(SELECTABLE_ATTR, "");
  }

  private clearSelectableMarks(): void {
    document.querySelectorAll(`[${SELECTABLE_ATTR}]`).forEach((el) => {
      el.removeAttribute(SELECTABLE_ATTR);
    });
    // 标记清空后样式也不再常驻页面；下次需要时 ensureStyle 会重新注入。
    document.getElementById(STYLE_ID)?.remove();
  }

  private isInteractive(element: Element): boolean {
    return Boolean(
      element.closest(
        'button, a, input, textarea, select, [contenteditable], [role="button"], [role="link"]',
      ),
    );
  }

  /**
   * 目标自身或最多上溯 3 层找到包含非空白文本的元素。
   * 文本判断走 containsNonSpaceText 的有界扫描，不用 textContent
   * 整棵序列化——大页面上那会把每次点击变成全子树字符串拷贝。
   */
  private findTextElement(element: Element): Element | null {
    let current: Element | null = element;
    for (let depth = 0; depth < 4 && current; depth += 1) {
      if (containsNonSpaceText(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  /**
   * 从文本元素向上找出“被禁用的整个区域”：
   * 连续 user-select: none 的最外层祖先（到 body/html 为止）。
   * 在飞书文档中即正文内容容器；在普通页面的小范围禁用上即该小元素。
   */
  private findBlockedRegion(element: Element): Element | null {
    let region: Element | null = null;
    let current: Element | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (getComputedStyle(current).userSelect === "none") {
        region = current;
      } else {
        break;
      }
      current = current.parentElement;
    }
    return region;
  }

  private ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${SELECTABLE_ATTR}], [${SELECTABLE_ATTR}] * { user-select: text !important; -webkit-user-select: text !important; }`;
    (document.head ?? document.documentElement).appendChild(style);
  }
}
