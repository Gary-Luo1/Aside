/**
 * 在禁止选择的网页（如开启防复制的飞书文档）上，按用户手势恢复文本选择。
 *
 * 仅在用户在“包含文本且 user-select: none”的内容上按下鼠标时生效：
 * 把该内容所在的不可选区域临时标记为可选中（样式带 !important，
 * 与站点规则一致地作用于整块内容），随后浏览器原生拖选即可工作。
 * 不复制、不读取、不发送任何未选中内容。
 */

const STYLE_ID = "aside-selectable-style";
const SELECTABLE_ATTR = "data-aside-selectable";

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
    for (const el of document.querySelectorAll(`[${SELECTABLE_ATTR}]`)) {
      el.removeAttribute(SELECTABLE_ATTR);
    }
  }

  private isInteractive(element: Element): boolean {
    return Boolean(
      element.closest(
        'button, a, input, textarea, select, [contenteditable], [role="button"], [role="link"]',
      ),
    );
  }

  /** 目标自身或最多上溯 3 层找到包含非空白文本的元素。 */
  private findTextElement(element: Element): Element | null {
    let current: Element | null = element;
    for (let depth = 0; depth < 4 && current; depth += 1) {
      if ((current.textContent ?? "").trim().length > 0) return current;
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
