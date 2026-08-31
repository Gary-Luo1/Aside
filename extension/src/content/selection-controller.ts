import {
  requestExplainTerm,
  requestSetupConfig,
  type AiConfig,
  type SetupConfigResult,
} from "../shared/messages.ts";
import { sanitizeTerm } from "../shared/term.ts";
import type { RectLike } from "./position-card.ts";
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

  constructor() {
    this.session = new SelectionSession({ sanitizeTerm });
  }

  attach(): void {
    document.addEventListener("selectionchange", () => this.handleSelectionChange());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.apply(this.session.on({ kind: "escape" }));
      }
    });
    window.addEventListener("pointerdown", (event) => this.handlePointerDown(event), true);
    document.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    document.addEventListener("click", (event) => {
      if (this.overlayContainsEvent(event)) {
        this.apply(this.session.on({ kind: "overlay-click" }));
      }
    });
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

  private handleScroll(): void {
    // 只有 ready / hint 会跟随选区关闭；其余状态直接跳过，避免每次滚动都强制重排。
    const state = this.session.state;
    if (state !== "ready" && state !== "hint") return;
    const anchor = this.session.anchor;
    if (anchor === null) return;
    this.apply(
      this.session.on({ kind: "scroll", anchorInViewport: this.anchorInViewport(anchor) }),
    );
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
      return { ok: false, message: "暂时连不上，请刷新这个网页后再试。" };
    }
  }

  private apply(outcome: SessionOutcome): void {
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

  private anchorInViewport(rect: RectLike): boolean {
    const margin = 8;
    return (
      rect.bottom > margin &&
      rect.top < window.innerHeight - margin &&
      rect.right > margin &&
      rect.left < window.innerWidth - margin
    );
  }
}
