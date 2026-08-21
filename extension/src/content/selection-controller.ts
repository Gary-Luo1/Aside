import { requestExplainTerm } from "../shared/messages";
import { sanitizeTerm } from "../shared/term";
import type { RectLike } from "./position-card";
import {
  HINT_DISMISS_MS,
  SelectionSession,
  type SelectionSnapshot,
  type SessionOutcome,
} from "./session";
import { ExplanationOverlay, type OverlayApi, type RenderData } from "./ui/overlay";

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
    const snapshot = this.snapshotSelection();
    if (snapshot?.anchorNode && this.overlayContainsNode(snapshot.anchorNode)) return;
    this.apply(this.session.on({ kind: "selection-changed", selection: snapshot }));
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
    const snapshot = this.snapshotSelection();
    if (snapshot?.anchorNode && this.overlayContainsNode(snapshot.anchorNode)) return;
    this.apply(
      this.session.on({
        kind: "pointer-up",
        insideOverlay: this.overlayContainsEvent(event),
        selection: snapshot,
      }),
    );
  }

  private handleScroll(): void {
    const currentAnchor = this.snapshotSelection()?.rect ?? null;
    this.apply(
      this.session.on({
        kind: "scroll",
        anchorInViewport: currentAnchor === null ? false : this.anchorInViewport(currentAnchor),
      }),
    );
  }

  private handleBlur(): void {
    const snapshot = this.snapshotSelection();
    if (snapshot?.anchorNode && this.overlayContainsNode(snapshot.anchorNode)) return;
    this.apply(this.session.on({ kind: "blur", selection: snapshot }));
  }

  private snapshotSelection(): SelectionSnapshot | null {
    const selection = window.getSelection();
    if (!selection) return null;
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
      rect:
        rect.width === 0 && rect.height === 0
          ? null
          : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    };
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
            error: { code: "unknown", message: "无法连接扩展后台，请重新加载页面后重试。" },
          },
        }),
      );
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
          data.error = outcome.result.error;
          if (outcome.result.error.code === "unconfigured" || outcome.result.error.code === "host_permission") {
            data.onOpenOptions = () => void chrome.runtime.openOptionsPage();
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
