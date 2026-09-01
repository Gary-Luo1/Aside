import {
  requestCancelExplain,
  requestExplainTerm,
  requestSetupConfig,
  type AiConfig,
  type SetupConfigResult,
} from "../shared/messages.ts";
import { sanitizeTerm } from "../shared/term.ts";
import { anchorInViewport } from "./position-card.ts";
import {
  HINT_DISMISS_MS,
  SelectionSession,
  type SelectionSnapshot,
  type SessionOutcome,
} from "./session.ts";
import { pickSelectionSnapshot, snapshotSelection } from "./selection-snapshot.ts";
import { ExplanationOverlay, type OverlayApi, type RenderData } from "./ui/overlay.ts";

/** 卡片内配置表单的初始空值。 */
const EMPTY_CONFIG: AiConfig = { baseUrl: "", apiKey: "", model: "" };

/**
 * 选词触发的 DOM 适配器：把页面事件翻译成选词会话事件，
 * 并执行会话输出的副作用（渲染、计时器、请求）。决策全部在会话模块内。
 */
export class SelectionController {
  private overlay: OverlayApi | null = null;
  private readonly session: SelectionSession;
  private hintTimer: number | null = null;
  /** 滚动检测的 rAF 句柄：读实时选区矩形要付一次布局开销，一帧最多做一次。 */
  private scrollFrame: number | null = null;

  constructor() {
    this.session = new SelectionSession({ sanitizeTerm });
  }

  attach(): void {
    document.addEventListener("selectionchange", () => this.handleSelectionChange());
    // window 捕获阶段听 Esc：页面拦掉 document 阶段的事件传播也不影响关闭卡片。
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;
        // 卡片内输入框聚焦时把 Esc 留给表单，避免误关丢掉已输入的密钥
        if (this.overlayContainsEvent(event) && isEditableTarget(event.target)) return;
        this.apply(this.session.on({ kind: "escape" }));
      },
      true,
    );
    window.addEventListener("pointerdown", (event) => this.handlePointerDown(event), true);
    document.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    // 与入口点击同一防线（window 捕获）：页面阻断 document 阶段传播时，
    // 卡片内点击仍能同步会话状态。先于 trigger 处理器注册，因此也先执行。
    window.addEventListener("click", (event) => this.handleOverlayClick(event), true);
    document.addEventListener("pointercancel", () => {
      this.apply(this.session.on({ kind: "pointer-cancel" }));
    });
    window.addEventListener("scroll", () => this.handleScroll(), true);
    window.addEventListener("blur", () => this.handleBlur());
  }

  private ensureOverlay(): OverlayApi {
    if (!this.overlay) this.overlay = new ExplanationOverlay();
    return this.overlay;
  }

  private overlayContainsEvent(event: Event): boolean {
    return this.overlay?.containsEvent(event) ?? false;
  }

  private overlayContainsNode(node: Node | null): boolean {
    return this.overlay?.containsNode(node) ?? false;
  }

  private handleSelectionChange(): void {
    // 拖选期间会话会丢弃快照；先判断再做，避免每次 selectionchange 都强制重排。
    if (this.session.dragging) return;
    this.apply(this.session.on({ kind: "selection-changed", selection: this.snapshotSelection() }));
  }

  private handlePointerDown(event: PointerEvent): void {
    this.apply(
      this.session.on({
        kind: "pointer-down",
        insideOverlay: this.overlayContainsEvent(event),
        selection: this.snapshotSelection(),
      }),
    );
  }

  private handlePointerUp(event: PointerEvent): void {
    this.apply(
      this.session.on({
        kind: "pointer-up",
        insideOverlay: this.overlayContainsEvent(event),
        selection: this.snapshotSelection(),
      }),
    );
  }

  /**
   * 卡片内点击的会话同步。塌陷补发只做 success（隐藏继续解释入口）与
   * hint（点提示本体关闭）两件事；ready/loading 下一律不补发——
   * 本处理器先于 trigger 处理器执行，ready 下补发塌陷会把刚要开始的解释关掉。
   */
  private handleOverlayClick(event: Event): void {
    if (!this.overlayContainsEvent(event)) return;
    this.apply(this.session.on({ kind: "overlay-click" }));
    const state = this.session.state;
    if (state !== "success" && state !== "hint") return;
    const snapshot = this.snapshotSelection();
    if (snapshot && (snapshot.collapsed || snapshot.text.length === 0)) {
      this.apply(this.session.on({ kind: "selection-changed", selection: snapshot }));
    }
  }

  /** ready / hint 且带锚点：只有这两态的入口跟随选区，滚出视口时关闭。 */
  private entryFollowsSelection(): boolean {
    if (this.session.state !== "ready" && this.session.state !== "hint") return false;
    return this.session.anchor !== null;
  }

  private handleScroll(): void {
    // 其余状态直接跳过，避免滚动路径白付一次取选区矩形的布局开销。
    if (!this.entryFollowsSelection()) return;
    // 合帧到 rAF：滚动事件高频，而判定必须读“当前”选区矩形（选区时刻的
    // 旧坐标在滚动后恒为“在视口内”，会让关闭语义完全失效）。
    if (this.scrollFrame !== null) return;
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = null;
      // 回调触发时状态可能已变，再查一次。
      if (!this.entryFollowsSelection()) return;
      const snapshot = this.snapshotWindowSelection();
      this.apply(
        this.session.on({
          kind: "scroll",
          anchorInViewport: anchorInViewport(snapshot?.rect ?? null, {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        }),
      );
    });
  }

  private handleBlur(): void {
    const snapshot = this.snapshotSelection();
    if (snapshot?.anchorNode && this.overlayContainsNode(snapshot.anchorNode)) return;
    this.apply(this.session.on({ kind: "blur", selection: snapshot }));
  }

  private snapshotSelection(): SelectionSnapshot | null {
    return pickSelectionSnapshot(
      this.overlay?.readExplainSelection() ?? null,
      this.snapshotWindowSelection(),
      (node) => this.overlayContainsNode(node),
    );
  }

  private snapshotWindowSelection(): SelectionSnapshot | null {
    const selection = window.getSelection();
    return selection ? snapshotSelection(selection) : null;
  }

  private explain(term: string): void {
    this.apply(this.session.on({ kind: "explain-requested", term }));
  }

  private close(): void {
    this.apply(this.session.on({ kind: "close" }));
  }

  private async runExplain(seq: number, term: string): Promise<void> {
    try {
      const result = await requestExplainTerm(term);
      this.apply(this.session.on({ kind: "explain-settled", seq, result }));
    } catch {
      this.apply(
        this.session.on({
          kind: "explain-settled",
          seq,
          result: {
            ok: false,
            error: { code: "unknown", message: "暂时连不上，请刷新这个网页后再试。" },
          },
        }),
      );
    }
  }

  /** 保存卡片内填写的配置；成功后立即用当前词重发解释。 */
  private async saveConfigAndRetry(config: AiConfig): Promise<SetupConfigResult> {
    try {
      const result = await requestSetupConfig(config);
      if (result.ok) {
        const term = this.session.term;
        if (term !== null) this.explain(term);
      }
      return result;
    } catch {
      return {
        ok: false,
        error: { code: "network", message: "暂时连不上，请刷新这个网页后再试。" },
      };
    }
  }

  private apply(outcome: SessionOutcome): void {
    // 会话作废了在途请求（关闭 / 换词 / 超长提示）时，通知后台中止计费。
    if ("cancelInFlight" in outcome && outcome.cancelInFlight) {
      void requestCancelExplain();
    }
    switch (outcome.action) {
      case "none":
        return;
      case "close":
        this.clearHintTimer();
        this.overlay?.close();
        return;
      case "show-hint":
        this.clearHintTimer();
        this.ensureOverlay().render("hint", {
          term: "",
          anchor: outcome.anchor,
          hintMessage: outcome.message,
        });
        this.scheduleHintTimer();
        return;
      case "show-ready":
        this.clearHintTimer();
        this.ensureOverlay().render("ready", {
          term: outcome.term,
          anchor: outcome.anchor,
          onExplain: (term) => this.explain(term),
        });
        return;
      case "show-followup":
        this.ensureOverlay().showFollowup(outcome.term, outcome.anchor, (term) =>
          this.explain(term),
        );
        return;
      case "hide-followup":
        this.overlay?.hideFollowup();
        return;
      case "start-explain": {
        this.ensureOverlay().render("loading", {
          term: outcome.term,
          anchor: this.session.anchor,
          onClose: () => this.close(),
        });
        void this.runExplain(outcome.seq, outcome.term);
        return;
      }
      case "finish-explain": {
        const data: RenderData = {
          term: outcome.term,
          anchor: outcome.anchor,
          onClose: () => this.close(),
        };
        if (outcome.result.ok) {
          data.explanation = outcome.result.explanation;
        } else {
          const code = outcome.result.error.code;
          data.error = outcome.result.error;
          if (code === "unconfigured" || code === "host_permission") {
            // 卡片内直接配置：保存成功后立刻重发解释，全程不离开当前页。
            data.setup = {
              initial: EMPTY_CONFIG,
              onSave: (config) => this.saveConfigAndRetry(config),
            };
          } else {
            data.onRetry = () => {
              const term = this.session.term;
              if (term !== null) this.explain(term);
            };
          }
        }
        this.ensureOverlay().render(outcome.result.ok ? "success" : "error", data);
        return;
      }
    }
  }

  private scheduleHintTimer(): void {
    this.hintTimer = window.setTimeout(() => {
      this.hintTimer = null;
      this.apply(this.session.on({ kind: "hint-timeout" }));
    }, HINT_DISMISS_MS);
  }

  private clearHintTimer(): void {
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }
}

/** Esc 兜底守卫：只让卡片内真实可编辑元素留住 Esc，页面输入框不在此列。 */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
