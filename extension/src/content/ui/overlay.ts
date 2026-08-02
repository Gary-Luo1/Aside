import type { Explanation, ExtensionError } from "../../shared/messages";
import { computePlacement, type RectLike } from "../position-card";
import type { UiState } from "../session";
import styles from "./styles.css";

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
}

/** 页面内解释 UI：Shadow DOM 隔离，所有模型输出以 textContent 渲染。 */
export class ExplanationOverlay implements OverlayApi {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  private cardElement: HTMLElement | null = null;
  private anchorRect: RectLike | null = null;
  private triggerClickHandler: ((event: Event) => void) | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "i-am-fine-overlay";
    this.host.style.cssText =
      "all:initial; position:fixed; left:0; top:0; width:0; height:0; z-index:2147483647;";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadowRoot.appendChild(style);
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

  render(state: UiState, data: RenderData): void {
    this.clear();
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
    this.triggerClickHandler = (event) => {
      if (event.composedPath().includes(trigger)) {
        data.onExplain?.(data.term);
      }
    };
    window.addEventListener("click", this.triggerClickHandler, true);
    this.shadowRoot.appendChild(trigger);
    this.place(trigger, data.anchor);
    trigger.focus({ preventScroll: true });
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
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = "正在解释…";
    body.append(spinner, text);
    card.querySelector(".card-body")!.append(body);
    this.finalize(card, data);
  }

  private renderSuccess(data: RenderData): void {
    const card = this.createCardShell(data.term, data.onClose);
    const body = card.querySelector(".card-body")!;
    const columns = document.createElement("div");
    columns.className = "columns";

    const professional = this.createColumn("专业解释", data.explanation?.professional ?? "");
    const plain = this.createColumn("通俗解释", data.explanation?.plain ?? "");
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

    if (data.error?.code === "unconfigured") {
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
    card.setAttribute("aria-label", "术语解释");

    const header = document.createElement("header");
    header.className = "card-header";

    const kicker = document.createElement("span");
    kicker.className = "kicker";
    kicker.textContent = "I am Fine";

    const titleRow = document.createElement("div");
    titleRow.className = "title-row";
    const title = document.createElement("span");
    title.className = "card-title";
    const termSpan = document.createElement("span");
    termSpan.className = "term";
    termSpan.textContent = `“${term}”`;
    title.appendChild(termSpan);
    title.appendChild(document.createTextNode("术语解释"));
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
    const privacy = document.createElement("p");
    privacy.textContent = `本次只使用了“${term}”`;
    const caveat = document.createElement("p");
    caveat.textContent = "AI 生成内容可能不准确，重要信息请进一步核对。";
    footer.append(privacy, caveat);

    card.append(header, body, footer);
    return card;
  }

  private createColumn(titleText: string, content: string): HTMLElement {
    const column = document.createElement("section");
    column.className = "col";
    const heading = document.createElement("h3");
    heading.textContent = titleText;
    const text = document.createElement("p");
    text.textContent = content; // 纯文本渲染，不执行 HTML/脚本
    column.append(heading, text);
    return column;
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

  private clear(): void {
    if (this.triggerClickHandler) {
      window.removeEventListener("click", this.triggerClickHandler, true);
      this.triggerClickHandler = null;
    }
    this.cardElement = null;
    this.host.style.display = ""; // 渲染前恢复显示
    this.shadowRoot.querySelectorAll(".card, .trigger, .hint").forEach((el) => el.remove());
  }
}
