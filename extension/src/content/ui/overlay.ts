import type {
  AiConfig,
  Explanation,
  ExtensionError,
  SetupConfigResult,
  SetupMode,
} from "../../shared/messages.ts";
import { PROVIDER_PRESETS, type ProviderPreset } from "../../shared/presets.ts";
import { computePlacement, type RectLike } from "../position-card.ts";
import { snapshotSelection } from "../selection-snapshot.ts";
import type { SelectionSnapshot, UiState } from "../session.ts";
import styles from "./styles.css";
import tokens from "../../shared/tokens.css";
import gochiHand from "../../../public/fonts/gochi-hand.woff2";
import { isTrustedOverlayClick } from "./trusted-click.ts";

/** 卡片内配置表单的数据与回调；保存成功后由控制器自动重试解释。 */
export interface SetupFormData {
  mode: SetupMode;
  initial: AiConfig;
  onSave: (config: AiConfig) => Promise<SetupConfigResult>;
}

/** 单状态渲染所需的数据与回调；由会话控制器按状态组装。 */
export interface RenderData {
  term: string;
  anchor: RectLike | null;
  hintMessage?: string;
  explanation?: Explanation;
  error?: ExtensionError;
  setup?: SetupFormData;
  onExplain?: (term: string) => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onClose?: () => void;
  onOpenOptions?: () => void;
  onGrantPermission?: () => Promise<SetupConfigResult>;
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
  /** 卡片打开前的焦点位置，关闭时归还。 */
  private previousFocus: HTMLElement | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "aside-overlay";
    this.host.style.cssText =
      "all:initial; position:fixed; left:0; top:0; width:0; height:0; z-index:2147483647;";
    // closed：页面 JS 不能通过 host.shadowRoot 读取解释或点击入口。
    this.shadowRoot = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    // tokens 放在组件样式后面：`:host { all: initial }` 会清掉自定义属性，变量必须后写。
    style.textContent = `@font-face{font-family:"Gochi Hand";font-style:normal;font-weight:400;font-display:swap;src:url("${gochiHand}") format("woff2");}${styles}${tokens}`;
    this.shadowRoot.appendChild(style);
    (document.body ?? document.documentElement).appendChild(this.host);
  }

  /**
   * 页面（如重型 SPA）重渲染时可能移出宿主节点；渲染前检查并重新挂载，
   * 保证入口/卡片仍然可见可点。
   * 相比常驻 MutationObserver，惰性检查让「没有卡片的 frame」零开销。
   */
  private ensureHostMounted(): void {
    if (this.host.isConnected) return;
    (document.body ?? document.documentElement).appendChild(this.host);
  }

  containsEvent(event: Event): boolean {
    return event.composedPath().some((node) => node === this.host);
  }

  containsNode(node: Node | null): boolean {
    return node !== null && (this.host === node || this.shadowRoot === node.getRootNode());
  }

  /**
   * 只读取解释正文里的选区，避免标题/页脚误触发继续解释。
   *
   * 两个来源依次尝试：ShadowRoot.getSelection 从未标准化，多数现代 Chrome 上并不存在，
   * 因此这里做能力探测而非直接调用。实际生效的是 window.getSelection() —— 它能否返回
   * closed shadow 内部的选区由 Chrome 实现决定。若某天这条路径失效，「卡片内继续划词」
   * 会静默退化为不可用（不报错、不显示入口），改动浏览器选区行为后请回归验证这一项。
   */
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
    return snapshotSelection(candidate, true);
  }

  showFollowup(term: string, anchor: RectLike, onExplain: (term: string) => void): void {
    this.ensureHostMounted();
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
    this.ensureHostMounted();
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
    this.restoreFocus();
  }

  private restoreFocus(): void {
    const target = this.previousFocus;
    this.previousFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
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
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-cols";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.append(this.createSkeletonColumn(), this.createSkeletonColumn());
    body.append(skeleton);
    card.querySelector(".card-body")!.append(body);
    this.finalize(card, "正在解释…");
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

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "action-button reexplain";
    refresh.textContent = "重新解释";
    refresh.addEventListener("click", () => data.onRefresh?.());
    card.querySelector(".card-footer")?.append(refresh);
    this.finalize(card, `已生成「${data.term}」的专业解释和通俗解释。`);
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

    if (data.setup) {
      errorBody.appendChild(this.createSetupForm(data.setup, data.onOpenOptions));
      body.appendChild(errorBody);
      this.finalize(card, data.error?.message ?? "");
      return;
    }

    const actions = document.createElement("div");
    actions.className = "error-actions";

    if (data.onGrantPermission) {
      errorBody.appendChild(this.createGrantActions(data));
      body.appendChild(errorBody);
      this.finalize(card, data.error?.message ?? "");
      return;
    }

    if (data.onRetry) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "action-button primary";
      retry.textContent = "重试";
      retry.addEventListener("click", () => data.onRetry?.());
      actions.appendChild(retry);
    }

    if (data.onOpenOptions && !data.onRetry) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "action-button primary";
      open.textContent = "打开设置";
      open.addEventListener("click", () => data.onOpenOptions?.());
      actions.appendChild(open);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "action-button";
    close.textContent = "关闭";
    close.addEventListener("click", () => data.onClose?.());
    actions.appendChild(close);

    errorBody.appendChild(actions);
    body.appendChild(errorBody);
    this.finalize(card, data.error?.message ?? "");
  }

  private createGrantActions(data: RenderData): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "setup";
    const actions = document.createElement("div");
    actions.className = "error-actions";
    const grant = document.createElement("button");
    grant.type = "button";
    grant.className = "action-button primary";
    grant.textContent = "允许访问并重试";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "action-button";
    open.textContent = "打开设置";
    open.addEventListener("click", () => data.onOpenOptions?.());
    const status = document.createElement("p");
    status.className = "setup-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    grant.addEventListener("click", () => {
      grant.disabled = true;
      open.disabled = true;
      status.dataset.tone = "info";
      status.textContent = "正在请求访问权限…";
      void (async () => {
        try {
          const result = await data.onGrantPermission?.();
          if (result?.ok) {
            status.dataset.tone = "ok";
            status.textContent = "已允许，正在解释…";
            return;
          }
          status.dataset.tone = "error";
          status.textContent = result?.error.message ?? "暂时没能完成授权。";
        } catch {
          status.dataset.tone = "error";
          status.textContent = "暂时没能完成授权。";
        }
        grant.disabled = false;
        open.disabled = false;
      })();
    });
    actions.append(grant, open);
    wrap.append(actions, status);
    return wrap;
  }

  /**
   * 卡片内配置表单：接口地址 / 密钥 / 模型，保存成功后由控制器自动重试解释。
   * 输入框逐一做事件隔离，尽量不让输入内容穿过 shadow 边界。
   */
  private createSetupForm(setup: SetupFormData, onOpenOptions?: () => void): HTMLElement {
    const form = document.createElement("form");
    form.className = "setup";
    form.noValidate = true;

    const baseUrl = this.createSetupField(
      "接口地址",
      "url",
      "https://api.example.com/v1",
      setup.initial.baseUrl,
    );
    const apiKey = this.createSetupField(
      "密钥",
      "password",
      setup.mode === "replace" ? "重新填写密钥" : "",
      setup.initial.apiKey,
    );
    const model = this.createSetupField("模型名称", "text", "qwen-plus", setup.initial.model);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "action-button setup-toggle";
    toggle.textContent = "显示";
    toggle.addEventListener("click", () => {
      const reveal = apiKey.input.type === "password";
      apiKey.input.type = reveal ? "text" : "password";
      toggle.textContent = reveal ? "隐藏" : "显示";
    });
    apiKey.row.appendChild(toggle);

    const status = document.createElement("p");
    status.className = "setup-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "action-button primary setup-submit";
    submit.textContent = "保存并解释";

    form.append(baseUrl.row, apiKey.row, model.row);
    this.appendPresets(
      form,
      (preset) => {
        baseUrl.input.value = preset.baseUrl;
        model.input.value = preset.model;
      },
      setup.mode,
    );
    form.append(status, submit);
    if (onOpenOptions) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "action-button";
      open.textContent = "打开设置";
      open.addEventListener("click", () => onOpenOptions());
      form.append(open);
    }

    const setStatus = (text: string, tone: "info" | "ok" | "error"): void => {
      status.textContent = text;
      status.dataset.tone = tone;
    };
    const setBusy = (busy: boolean): void => {
      for (const button of form.querySelectorAll("button")) {
        if (button instanceof HTMLButtonElement) button.disabled = busy;
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setBusy(true);
      setStatus("正在测试连接…", "info");
      void (async () => {
        try {
          const result = await setup.onSave({
            baseUrl: baseUrl.input.value.trim(),
            apiKey: apiKey.input.value.trim(),
            model: model.input.value.trim(),
          });
          if (result.ok) {
            // 控制器会切到 loading 并重试，保持禁用避免重复提交。
            setStatus("连接正常，正在解释…", "ok");
            return;
          }
          setStatus(result.error.message, "error");
        } catch {
          setStatus("保存失败，请稍后再试。", "error");
        }
        setBusy(false);
      })();
    });

    return form;
  }

  private appendPresets(
    form: HTMLElement,
    apply: (preset: ProviderPreset) => void,
    mode: SetupMode,
  ): void {
    const row = document.createElement("div");
    row.className = "setup-presets";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "常用接口示例");
    for (const preset of PROVIDER_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-button setup-preset";
      button.textContent = preset.label;
      button.addEventListener("click", () => apply(preset));
      row.appendChild(button);
    }
    const note = document.createElement("p");
    note.className = "setup-note";
    note.textContent =
      mode === "replace"
        ? "密钥需要重新填写。保存前会先测试连接，通过后才会替换已有配置。"
        : "点一下填入地址和模型，密钥仍要自己填。保存前会先测试连接。";
    form.append(row, note);
  }

  private createSetupField(
    labelText: string,
    type: string,
    placeholder: string,
    value: string,
  ): { row: HTMLElement; input: HTMLInputElement } {
    const row = document.createElement("div");
    row.className = "setup-row";
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.className = "setup-label";
    caption.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    this.isolateInput(input);
    label.append(caption, input);
    row.appendChild(label);
    return { row, input };
  }

  /**
   * 隔离输入框的输入类事件：阻止按键与输入事件穿过 shadow 边界冒泡到页面。
   *
   * 局限：页面在 document「捕获」阶段的监听会先于这些处理器触发，无法阻止。
   * 因此在不受信任的页面上仍建议通过工具栏打开设置页填写密钥。
   */
  private isolateInput(input: HTMLInputElement): void {
    for (const type of INPUT_ISOLATION_EVENTS) {
      input.addEventListener(type, stopEvent);
    }
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
    const live = document.createElement("p");
    live.className = "sr-only";
    live.dataset.live = "";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    footer.append(caveat, live);

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

  private finalize(card: HTMLElement, announcement?: string): void {
    this.cardElement = card;
    this.shadowRoot.appendChild(card);
    if (announcement) {
      const live = card.querySelector<HTMLElement>("[data-live]");
      const text = announcement;
      requestAnimationFrame(() => {
        if (live?.isConnected) live.textContent = text;
      });
    }
    if (this.anchorRect) {
      this.place(card, this.anchorRect);
    } else {
      requestAnimationFrame(() => {
        if (this.cardElement === card) this.place(card, this.anchorRect);
      });
    }
    // 卡片是 role="dialog"，聚焦关闭按钮便于键盘操作；同时记下原焦点，
    // 关闭时归还，避免用户失去页面上的输入位置。
    if (this.previousFocus === null) {
      const active = document.activeElement;
      this.previousFocus = active instanceof HTMLElement ? active : null;
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

  /** 继续解释入口避开关闭和「重新解释」，避免叠在控件上却被点成新解释。 */
  private placeFollowup(trigger: HTMLElement, anchor: RectLike): void {
    this.place(trigger, anchor);
    const blockers = [
      ...this.shadowRoot.querySelectorAll<HTMLElement>(".close, .reexplain"),
    ].filter((el) => !el.hidden);
    if (blockers.length === 0) return;

    const originLeft = Number.parseFloat(trigger.style.left);
    const originTop = Number.parseFloat(trigger.style.top);
    if (!Number.isFinite(originLeft) || !Number.isFinite(originTop)) return;

    // 先一次性取完所有矩形，后续候选位置纯数学推算，避免每个偏移都触发一次强制布局。
    const base = trigger.getBoundingClientRect();
    const blockerRects = blockers.map((el) => el.getBoundingClientRect());

    for (const [dx, dy] of FOLLOWUP_OFFSETS) {
      const box = {
        left: base.left + dx,
        right: base.right + dx,
        top: base.top + dy,
        bottom: base.bottom + dy,
      };
      const inView =
        box.left >= 8 &&
        box.top >= 8 &&
        box.right <= window.innerWidth - 8 &&
        box.bottom <= window.innerHeight - 8;
      const hits = blockerRects.some((b) => rectsOverlap(box, b, 6));
      if (inView && !hits) {
        trigger.style.left = `${originLeft + dx}px`;
        trigger.style.top = `${originTop + dy}px`;
        return;
      }
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

/** 继续解释入口的候选偏移：原位 → 上下 → 左右 → 对角 → 更远。 */
const FOLLOWUP_OFFSETS: ReadonlyArray<readonly [number, number]> = [
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

function rectsOverlap(a: RectLike, b: DOMRectReadOnly, pad: number): boolean {
  return !(
    a.right < b.left - pad ||
    a.left > b.right + pad ||
    a.bottom < b.top - pad ||
    a.top > b.bottom + pad
  );
}

/** 需要拦在 shadow 边界内的输入类事件。 */
const INPUT_ISOLATION_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "change",
  "paste",
  "cut",
  "copy",
  "select",
  "focusin",
  "focusout",
  "compositionstart",
  "compositionupdate",
  "compositionend",
] as const;

function stopEvent(event: Event): void {
  event.stopPropagation();
}
