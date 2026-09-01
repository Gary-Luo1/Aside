import type { ExplainResult } from "../shared/messages.ts";
import type { RectLike } from "./position-card.ts";
import { INVALID_TERM_HINT } from "../shared/term.ts";

export type UiState = "idle" | "ready" | "hint" | "loading" | "success" | "error";

/** pointerdown 瞬间的选区锚点，用于区分「新拖选」与「点击页面空白处」。 */
export interface Anchor {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
}

/** 控制器从真实 Selection 提取的不可变快照；rect 为 0×0 时传 null。 */
export interface SelectionSnapshot extends Anchor {
  collapsed: boolean;
  rangeCount: number;
  text: string;
  rect: RectLike | null;
  /** 选区落在解释卡片正文内时为 true，用于卡片内继续划词。 */
  fromOverlay?: boolean;
}

/**
 * 选词会话的纯决策输入。计时器、DOM、chrome 等副作用由控制器执行，
 * 并把结果以事件形式回投；本模块不做任何副作用。
 */
export type SessionEvent =
  | { kind: "selection-changed"; selection: SelectionSnapshot | null }
  | { kind: "pointer-down"; insideOverlay: boolean; selection: SelectionSnapshot | null }
  | { kind: "pointer-up"; insideOverlay: boolean; selection: SelectionSnapshot | null }
  | { kind: "pointer-cancel" }
  | { kind: "scroll"; anchorInViewport: boolean }
  | { kind: "blur"; selection: SelectionSnapshot | null }
  | { kind: "overlay-click" }
  | { kind: "escape" }
  | { kind: "hint-timeout" }
  | { kind: "close" }
  | { kind: "explain-requested"; term: string }
  | { kind: "explain-settled"; seq: number; result: ExplainResult };

/** 会话决策输出；控制器据此执行渲染、计时器与请求副作用。 */
export type SessionOutcome =
  | { action: "none" }
  | { action: "close"; cancelInFlight: boolean }
  | { action: "show-hint"; message: string; anchor: RectLike; cancelInFlight: boolean }
  | { action: "show-ready"; term: string; anchor: RectLike; cancelInFlight: boolean }
  | { action: "show-followup"; term: string; anchor: RectLike }
  | { action: "hide-followup" }
  | { action: "start-explain"; seq: number; term: string }
  | {
      action: "finish-explain";
      seq: number;
      term: string;
      anchor: RectLike | null;
      result: ExplainResult;
    };

/** 超长/换行选词提示的自动消失时间。 */
export const HINT_DISMISS_MS = 3_500;

const HINT_MESSAGE = INVALID_TERM_HINT;

export interface SelectionSessionOptions {
  sanitizeTerm: (raw: string) => string | null;
}

/**
 * 选词会话状态机（纯逻辑）：
 * idle → ready/hint → loading → success/error → close → idle。
 * 切换选词会作废旧请求结果（seq 守卫）；旧请求由后台中止。
 */
export class SelectionSession {
  private uiState: UiState = "idle";
  private currentTerm: string | null = null;
  private currentAnchor: RectLike | null = null;
  private seq = 0;
  private isDragging = false;
  private before: Anchor | null = null;
  /** 鼠标正按在入口/卡片内部时，忽略页面清空选区导致的入口关闭。 */
  private suppressCollapseClose = false;
  /** 有请求在途且其响应仍会被接受（seq 未被作废）；作废时应通知后台取消。 */
  private inFlightExplain = false;
  private readonly sanitizeTermFn: (raw: string) => string | null;

  constructor(options: SelectionSessionOptions) {
    this.sanitizeTermFn = options.sanitizeTerm;
  }

  get state(): UiState {
    return this.uiState;
  }

  get term(): string | null {
    return this.currentTerm;
  }

  get anchor(): RectLike | null {
    return this.currentAnchor;
  }

  /** 正在拖选：selectionchange 期间的快照会被丢弃，调用方可据此跳过取快照。 */
  get dragging(): boolean {
    return this.isDragging;
  }

  on(event: SessionEvent): SessionOutcome {
    switch (event.kind) {
      case "selection-changed":
        return this.onSelectionChanged(event.selection);
      case "pointer-down":
        return this.onPointerDown(event.insideOverlay, event.selection);
      case "pointer-up":
        return this.onPointerUp(event.insideOverlay, event.selection);
      case "pointer-cancel": {
        this.isDragging = false;
        this.before = null;
        this.suppressCollapseClose = false;
        return { action: "none" };
      }
      case "scroll":
        if (
          (this.uiState === "ready" || this.uiState === "hint") &&
          this.currentAnchor &&
          !event.anchorInViewport
        ) {
          return this.closeOutcome();
        }
        return { action: "none" };
      case "blur":
        if (!this.isDragging) return { action: "none" };
        this.isDragging = false;
        this.before = null;
        return this.syncFromSelection(event.selection);
      case "overlay-click":
        this.suppressCollapseClose = false;
        this.isDragging = false;
        return { action: "none" };
      case "escape":
        return this.uiState === "idle" ? { action: "none" } : this.closeOutcome();
      case "hint-timeout":
        return this.uiState === "hint" ? this.closeOutcome() : { action: "none" };
      case "close":
        return this.closeOutcome();
      case "explain-requested": {
        this.seq += 1;
        this.uiState = "loading";
        this.currentTerm = event.term;
        this.inFlightExplain = true;
        return { action: "start-explain", seq: this.seq, term: event.term };
      }
      case "explain-settled":
        return this.onExplainSettled(event.seq, event.result);
      default:
        return { action: "none" };
    }
  }

  private onSelectionChanged(selection: SelectionSnapshot | null): SessionOutcome {
    if (this.isDragging) return { action: "none" };
    return this.syncFromSelection(selection);
  }

  private onPointerDown(
    insideOverlay: boolean,
    selection: SelectionSnapshot | null,
  ): SessionOutcome {
    if (insideOverlay) {
      this.suppressCollapseClose = true;
      this.isDragging = true;
      this.before = selection;
      return { action: "none" };
    }
    this.suppressCollapseClose = false;
    // success 等到松手再决定：再划当前词要留卡，点空白才关。ready/hint/loading/error 仍按下即关。
    if (this.uiState === "success") {
      this.isDragging = true;
      this.before = selection;
      return { action: "none" };
    }
    const closed = this.uiState === "idle" ? { action: "none" as const } : this.closeOutcome();
    this.isDragging = true;
    // 快照在 close 之后记录（close 会清空 before），与「点击空白处不重弹」语义一致。
    this.before = selection;
    return closed;
  }

  private onPointerUp(insideOverlay: boolean, selection: SelectionSnapshot | null): SessionOutcome {
    this.isDragging = false;
    // 卡片内按下、卡外松开时 click 不会命中 overlay（目标落在公共祖先上），
    // 这里补一次复位，避免塌陷关闭被长期抑制。
    if (!insideOverlay) this.suppressCollapseClose = false;
    const before = this.before;
    this.before = null;
    if (insideOverlay) {
      if (
        this.uiState === "success" &&
        selection &&
        !selection.collapsed &&
        selection.text.length > 0 &&
        (before === null || !this.sameSelection(before, selection))
      ) {
        return this.syncFromSelection(selection);
      }
      return { action: "none" };
    }
    if (this.uiState === "success") {
      if (selection && !selection.collapsed && selection.text.length > 0) {
        return this.syncFromSelection(selection);
      }
      return this.closeOutcome();
    }
    if (before !== null && selection !== null && this.sameSelection(before, selection)) {
      return { action: "none" };
    }
    return this.syncFromSelection(selection);
  }

  /** 选区处理：空/折叠关闭、无效提示、有效显示入口。 */
  private syncFromSelection(selection: SelectionSnapshot | null): SessionOutcome {
    if (selection === null) {
      return this.closeOutcome(); // 取不到选区（异常场景）时无条件关闭，与旧行为一致
    }

    if (selection.collapsed || selection.rangeCount === 0 || selection.text.length === 0) {
      if (this.uiState === "success" && selection.fromOverlay) {
        return { action: "hide-followup" };
      }
      if ((this.uiState === "ready" || this.uiState === "hint") && !this.suppressCollapseClose) {
        return this.closeOutcome();
      }
      return { action: "none" };
    }

    if (this.uiState === "success" && !selection.fromOverlay) {
      const pageTerm = this.sanitizeTermFn(selection.text);
      if (pageTerm === this.currentTerm) {
        return { action: "none" };
      }
    }

    if (selection.rect === null) return { action: "none" };

    const term = this.sanitizeTermFn(selection.text);
    if (term === null) {
      if (selection.text.trim().length === 0) {
        if (this.uiState === "ready" || this.uiState === "hint") {
          return this.closeOutcome();
        }
        if (this.uiState === "success" && selection.fromOverlay) {
          return { action: "hide-followup" };
        }
        return { action: "none" };
      }
      if (this.uiState === "success" && selection.fromOverlay) {
        return { action: "hide-followup" };
      }
      return this.showHintOutcome(selection.rect);
    }

    return this.showReadyOutcome(term, selection.rect, selection.fromOverlay === true);
  }

  private onExplainSettled(seq: number, result: ExplainResult): SessionOutcome {
    if (seq !== this.seq) return { action: "none" }; // 过期响应
    this.inFlightExplain = false;
    this.uiState = result.ok ? "success" : "error";
    return {
      action: "finish-explain",
      seq,
      term: this.currentTerm ?? "",
      anchor: this.currentAnchor,
      result,
    };
  }

  private showHintOutcome(rect: RectLike): SessionOutcome {
    const cancelInFlight = this.invalidateInFlight();
    this.uiState = "hint";
    this.currentTerm = null;
    this.currentAnchor = rect;
    return { action: "show-hint", message: HINT_MESSAGE, anchor: rect, cancelInFlight };
  }

  private showReadyOutcome(term: string, rect: RectLike, fromOverlay = false): SessionOutcome {
    if (this.uiState === "success" && fromOverlay) {
      return { action: "show-followup", term, anchor: rect };
    }
    const cancelInFlight = this.invalidateInFlight();
    this.uiState = "ready";
    this.currentTerm = term;
    this.currentAnchor = rect;
    return { action: "show-ready", term, anchor: rect, cancelInFlight };
  }

  private closeOutcome(): SessionOutcome {
    const cancelInFlight = this.invalidateInFlight();
    this.uiState = "idle";
    this.currentTerm = null;
    this.currentAnchor = null;
    this.isDragging = false;
    this.before = null;
    return { action: "close", cancelInFlight };
  }

  /** 作废在途请求的响应接受权（seq 前移）；返回是否需要通知后台中止。 */
  private invalidateInFlight(): boolean {
    const had = this.inFlightExplain;
    this.inFlightExplain = false;
    this.seq += 1;
    return had;
  }

  private sameSelection(a: Anchor, b: Anchor): boolean {
    return (
      a.anchorNode === b.anchorNode &&
      a.anchorOffset === b.anchorOffset &&
      a.focusNode === b.focusNode &&
      a.focusOffset === b.focusOffset
    );
  }
}
