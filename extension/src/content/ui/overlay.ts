import type { Explanation, ExtensionError } from "../../shared/messages";
import { computePlacement, type RectLike } from "../position-card";
import type { SelectionSnapshot, UiState } from "../session";
import styles from "./styles.css";
import gochiHand from "../../../public/fonts/gochi-hand.woff2";
import { isTrustedOverlayClick } from "./trusted-click";

/** 单状态渲染所需的数据与回调；由会话控制器按状态组装。 */
export interface RenderData {
  term: string;
  anchor: RectLike | null;
  hintMessage?: string;
  explanation?: Explanation;
  error?: ExtensionError;
  onExplain?: (term: string) => void;
  onRetry?: () => void;
  onOpenOptions?: () => void;
  onClose?: () => void;
}

/** 页面内解释 UI 的窄接口：渲染、关闭与命中判断；宿主生命周期由实现内部管理。 */
export interface OverlayApi {
  render(state: UiState, data: RenderData): void;
  close(): void;
  containsEvent(event: Event): boolean;
  containsNode(node: Node | null): boolean;
  readExplainSelection(): SelectionSnapshot | null;
  showFollowup(term: string, anchor: RectLike, onExplain: (term: string) => void): void;
  hideFollowup(): void;
}

/** 页面内解释 UI：closed Shadow DOM 隔离，所有模型输出以 textContent 渲染。 */
export class ExplanationOverlay implements OverlayApi {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  private cardElement: HTMLElement | null = null;
  private anchorRect: RectLike | null = null;
  private readyClickHandler: ((event: Event) => void) | null = null;
  private followupClickHandler: ((event: Event) => void) | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "aside-overlay";
    this.host.style.cssText =
      "all:initial; position:fixed; left:0; top:0; width:0; height:0; z-index:2147483647;";
    // closed：页面 JS 不能通过 host.shadowRoot 读取解释或点击入口。
    this.shadowRoot = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `@font-face{font-family:"Gochi Hand";font-style:normal;font-weight:400;font-display:swap;src:url("${gochiHand}") format("woff2");}${styles}`;
    this.shadowRoot.appendChild(style);
    const filters = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    filters.setAttribute("aria-hidden", "true");
    filters.setAttribute("focusable", "false");
    filters.setAttribute("width", "0");
    filters.setAttribute("height", "0");
    filters.innerHTML =
      '<defs><filter id="crayon-wobble" x="-12%" y="-12%" width="124%" height="124%"><feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="3" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6.5" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
    this.shadowRoot.appendChild(filters);
    (document.body ?? document.documentElement).appendChild(this.host);

    // 页面（如重型 SPA）重渲染时可能移出宿主节点；被移出则重新挂载，
    // 保证入口/卡片仍然可见可点。
    const reattachHost = () => {
      if (!this.host.isConnected) {
        (document.body ?? document.documentElement).appendChild(this.host);
      }
    };
    const hostObserver = new MutationObserver(reattachHost);
    hostObserver.observe(document.body, { childList: true });
    hostObserver.observe(document.documentElement, { childList: true });
  }

  containsEvent(event: Event): boolean {
    return event.composedPath().some((node) => node === this.host);
  }

  containsNode(node: Node | null): boolean {
    return node !== null && (this.host === node || this.shadowRoot === node.getRootNode());
  }

  /** 只读取解释正文里的选区，避免标题/页脚误触发继续解释。 */
  readExplainSelection(): SelectionSnapshot | null {
    const root = this.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null };
    const shadowSel = root.getSelection?.() ?? null;
    const candidate =
      shadowSel && (shadowSel.rangeCount > 0 || Boolean(shadowSel.anchorNode))
        ? shadowSel
        : window.getSelection();
    if (!candidate) return null;
    const anchorNode = candidate.anchorNode;
    if (!anchorNode || !this.containsNode(anchorNode) || !this.isExplainBodyNode(anchorNode)) {
      return null;
    }
    return this.snapshotFrom(candidate, true);
  }

  showFollowup(term: string, anchor: RectLike, onExplain: (term: string) => void): void {
    this.hideFollowup();
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trigger followup";
    trigger.textContent = "解释这个词";
    this.bindTriggerClick("followup", trigger, () => onExplain(term));
    this.shadowRoot.appendChild(trigger);
    this.placeFollowup(trigger, anchor);
  }

  hideFollowup(): void {
    this.unbindTriggerClick("followup");
    this.shadowRoot.querySelectorAll(".trigger.followup").forEach((el) => el.remove());
  }

  render(state: UiState, data: RenderData): void {
    this.clear();
    this.host.dataset.state = state;
    this.anchorRect = data.anchor;
    switch (state) {
      case "ready":
        this.renderReady(data);
        break;
      case "hint":
        this.renderHint(data);
        break;
      case "loading":
        this.renderLoading(data);
        break;
      case "success":
        this.renderSuccess(data);
        break;
      case "error":
        this.renderError(data);
        break;
      default:
        break;
    }
  }

  close(): void {
    this.clear();
    delete this.host.dataset.state;
    this.host.style.display = "none"; // 关闭后不留下可见节点
  }

  /** 选区附近的小按钮。 */
  private renderReady(data: RenderData): void {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "trigger";
    trigger.textContent = "解释这个词";
    // 在 window 捕获阶段处理点击：即便页面在 document 捕获阶段阻止了事件传播，
    // 入口点击仍能触发解释；键盘激活（Enter/Space）同样产生 click，兼容保留。
    // 只接受真实用户手势，拒绝页面脚本的 HTMLElement.click()。
    this.bindTriggerClick("ready", trigger, () => data.onExplain?.(data.term));
    this.shadowRoot.appendChild(trigger);
    this.place(trigger, data.anchor);
  }

  /** 选区附近不可交互的提示（如超长/换行选词），不发送请求。 */
  private renderHint(data: RenderData): void {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.setAttribute("role", "status");
    hint.textContent = data.hintMessage ?? "";
    this.shadowRoot.appendChild(hint);
    this.place(hint, data.anchor);
  }

  /** 加载态：保留卡片轮廓，防止完成后明显跳位。 */
  private renderLoading(data: RenderData): void {
    const card = this.createCardShell(data.term, data.onClose);
    const body = document.createElement("div");
    body.className = "loading-body";
    const status = document.createElement("span");
    status.className = "sr-only";
    status.textContent = "正在解释…";
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-cols";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.append(this.createSkeletonColumn(), this.createSkeletonColumn());
    body.append(status, skeleton);
    card.querySelector(".card-body")!.append(body);
    this.finalize(card, data);
  }

  private renderSuccess(data: RenderData): void {
    const card = this.createCardShell(data.term, data.onClose);
    const body = card.querySelector(".card-body")!;
    const columns = document.createElement("div");
    columns.className = "columns";

    const professional = this.createColumn("专业解释", data.explanation?.professional ?? "", "pro");
    const plain = this.createColumn("通俗解释", data.explanation?.plain ?? "", "plain");
    columns.append(professional, plain);
    body.appendChild(columns);

    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "expand";
    expand.hidden = true;
    expand.textContent = "展开完整解释";
    expand.addEventListener("click", () => {
      card.classList.toggle("expanded");
      expand.textContent = card.classList.contains("expanded") ? "收起解释" : "展开完整解释";
      this.place(card, this.anchorRect);
    });
    body.appendChild(expand);
    this.finalize(card, data);

    const textEls = [professional.querySelector("p")!, plain.querySelector("p")!];
    const overflow = textEls.some((el) => el.scrollHeight > el.clientHeight + 1);
    expand.hidden = !overflow;
    if (overflow) this.place(card, this.anchorRect);
  }

  private renderError(data: RenderData): void {
    const card = this.createCardShell(data.term, data.onClose);
    const body = card.querySelector(".card-body")!;
    const errorBody = document.createElement("div");
    errorBody.className = "error-body";

    const message = document.createElement("p");
    message.className = "error-message";
    message.textContent = data.error?.message ?? "";
    errorBody.appendChild(message);

    const actions = document.createElement("div");
    actions.className = "error-actions";

    if (data.error?.code === "unconfigured" || data.error?.code === "host_permission") {
      const openOptions = document.createElement("button");
      openOptions.type = "button";
      openOptions.className = "action-button primary";
      openOptions.textContent = "打开设置";
      openOptions.addEventListener("click", () => data.onOpenOptions?.());
      actions.appendChild(openOptions);
    } else {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "action-button primary";
      retry.textContent = "重试";
      retry.addEventListener("click", () => data.onRetry?.());
      actions.appendChild(retry);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "action-button";
    close.textContent = "关闭";
    close.addEventListener("click", () => data.onClose?.());
    actions.appendChild(close);

    errorBody.appendChild(actions);
    body.appendChild(errorBody);
    this.finalize(card, data);
  }

  private createCardShell(term: string, onClose?: () => void): HTMLElement {
    const card = document.createElement("section");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "词语解释");

    const header = document.createElement("header");
    header.className = "card-header";

    const kicker = document.createElement("span");
    kicker.className = "kicker";
    kicker.setAttribute("aria-label", "aside");
    for (const letter of "aside") {
      const span = document.createElement("span");
      span.textContent = letter;
      kicker.appendChild(span);
    }

    const titleRow = document.createElement("div");
    titleRow.className = "title-row";
    const title = document.createElement("span");
    title.className = "card-title";
    const termSpan = document.createElement("span");
    termSpan.className = "term";
    termSpan.textContent = `“${term}”`;
    title.appendChild(termSpan);
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.setAttribute("aria-label", "关闭解释卡片");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => onClose?.());
    titleRow.append(title, closeButton);
    header.append(kicker, titleRow);

    const body = document.createElement("div");
    body.className = "card-body";

    const footer = document.createElement("footer");
    footer.className = "card-footer";
    const caveat = document.createElement("p");
    caveat.textContent = "AI 生成内容可能不准确，重要信息请进一步核对。";
    footer.append(caveat);

    card.append(header, body, footer);
    return card;
  }

  private createColumn(titleText: string, content: string, channel: "pro" | "plain"): HTMLElement {
    const column = document.createElement("section");
    column.className = channel === "plain" ? "col col-plain" : "col col-pro";
    const heading = document.createElement("h3");
    heading.textContent = titleText;
    const text = document.createElement("p");
    text.textContent = content; // 纯文本渲染，不执行 HTML/脚本
    column.append(heading, text);
    return column;
  }

  private createSkeletonColumn(): HTMLElement {
    const column = document.createElement("div");
    column.className = "skeleton-col";
    for (const cls of ["skel-title", "skel-line", "skel-line", "skel-line short"]) {
      const bar = document.createElement("span");
      bar.className = `skel ${cls}`;
      column.appendChild(bar);
    }
    return column;
  }

  private isExplainBodyNode(node: Node): boolean {
    const el = node instanceof Element ? node : node.parentElement;
    return Boolean(el?.closest(".col p"));
  }

  private snapshotFrom(selection: Selection, fromOverlay: boolean): SelectionSnapshot {
    const anchorNode = selection.anchorNode;
    const anchorOffset = selection.anchorOffset;
    const focusNode = selection.focusNode;
    const focusOffset = selection.focusOffset;
    if (selection.rangeCount === 0) {
      return {
        collapsed: true,
        rangeCount: 0,
        text: "",
        anchorNode,
        anchorOffset,
        focusNode,
        focusOffset,
        rect: null,
        fromOverlay,
      };
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    return {
      collapsed: selection.isCollapsed,
      rangeCount: selection.rangeCount,
      text: selection.toString(),
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset,
      fromOverlay,
      rect:
        rect.width === 0 && rect.height === 0
          ? null
          : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    };
  }

  private finalize(card: HTMLElement, data: RenderData): void {
    this.cardElement = card;
    this.shadowRoot.appendChild(card);
    if (this.anchorRect) {
      this.place(card, this.anchorRect);
    } else {
      requestAnimationFrame(() => {
        if (this.cardElement === card) this.place(card, this.anchorRect);
      });
    }
    const closeButton = card.querySelector<HTMLButtonElement>(".close");
    closeButton?.focus({ preventScroll: true });
  }

  private place(element: HTMLElement, anchorRect: RectLike | null): void {
    if (!anchorRect) return;
    const rect = element.getBoundingClientRect();
    const placement = computePlacement(
      anchorRect,
      { width: rect.width || 180, height: rect.height || 100 },
      { width: window.innerWidth, height: window.innerHeight },
    );
    element.style.left = `${placement.left}px`;
    element.style.top = `${placement.top}px`;
  }

  /** 继续解释入口避开关闭/展开，避免叠在控件上却被点成新解释。 */
  private placeFollowup(trigger: HTMLElement, anchor: RectLike): void {
    this.place(trigger, anchor);
    const blockers = [...this.shadowRoot.querySelectorAll<HTMLElement>(".close, .expand")].filter(
      (el) => !el.hidden,
    );
    if (blockers.length === 0) return;

    const originLeft = Number.parseFloat(trigger.style.left);
    const originTop = Number.parseFloat(trigger.style.top);
    if (!Number.isFinite(originLeft) || !Number.isFinite(originTop)) return;

    const offsets: Array<[number, number]> = [
      [0, 0],
      [0, -52],
      [0, 52],
      [-180, 0],
      [180, 0],
      [-180, -52],
      [180, -52],
      [0, -104],
      [0, 104],
    ];
    for (const [dx, dy] of offsets) {
      trigger.style.left = `${originLeft + dx}px`;
      trigger.style.top = `${originTop + dy}px`;
      const box = trigger.getBoundingClientRect();
      const inView =
        box.left >= 8 &&
        box.top >= 8 &&
        box.right <= window.innerWidth - 8 &&
        box.bottom <= window.innerHeight - 8;
      const hits = blockers.some((el) => rectsOverlap(box, el.getBoundingClientRect(), 6));
      if (inView && !hits) return;
    }
    trigger.style.left = `${originLeft}px`;
    trigger.style.top = `${originTop}px`;
  }

  private bindTriggerClick(
    slot: "ready" | "followup",
    trigger: HTMLElement,
    onExplain: () => void,
  ): void {
    this.unbindTriggerClick(slot);
    const handler = (event: Event) => {
      if (
        !isTrustedOverlayClick(event, trigger, {
          host: this.host,
          root: this.shadowRoot,
        })
      ) {
        return;
      }
      onExplain();
    };
    if (slot === "ready") this.readyClickHandler = handler;
    else this.followupClickHandler = handler;
    window.addEventListener("click", handler, true);
  }

  private unbindTriggerClick(slot: "ready" | "followup"): void {
    const handler = slot === "ready" ? this.readyClickHandler : this.followupClickHandler;
    if (!handler) return;
    window.removeEventListener("click", handler, true);
    if (slot === "ready") this.readyClickHandler = null;
    else this.followupClickHandler = null;
  }

  private clear(): void {
    this.hideFollowup();
    this.unbindTriggerClick("ready");
    this.cardElement = null;
    this.host.style.display = ""; // 渲染前恢复显示
    this.shadowRoot.querySelectorAll(".card, .trigger, .hint").forEach((el) => el.remove());
  }
}

function rectsOverlap(a: DOMRectReadOnly, b: DOMRectReadOnly, pad: number): boolean {
  return !(
    a.right < b.left - pad ||
    a.left > b.right + pad ||
    a.bottom < b.top - pad ||
    a.top > b.bottom + pad
  );
}
