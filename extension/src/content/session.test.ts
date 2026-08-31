import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTerm } from "../shared/term.ts";
import { SelectionSession, type SelectionSnapshot } from "./session.ts";

function snap(over: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    collapsed: false,
    rangeCount: 1,
    text: "闭包",
    rect: { left: 10, right: 50, top: 10, bottom: 30 },
    ...over,
  };
}

function collapsed(): SelectionSnapshot {
  return snap({ collapsed: true, rangeCount: 0, text: "", rect: null });
}

function collapsedInOverlay(): SelectionSnapshot {
  return snap({ collapsed: true, rangeCount: 0, text: "", rect: null, fromOverlay: true });
}

const session = (): SelectionSession => new SelectionSession({ sanitizeTerm });

/** 发起解释并返回 seq；顺带断言确实进入 loading。 */
function startExplain(s: SelectionSession, term: string): number {
  const out = s.on({ kind: "explain-requested", term });
  if (out.action !== "start-explain") {
    throw new Error(`期望 start-explain，实际是 ${out.action}`);
  }
  return out.seq;
}

function settleOk(s: SelectionSession, seq: number): void {
  const out = s.on({
    kind: "explain-settled",
    seq,
    result: { ok: true, explanation: { professional: "P", plain: "L" } },
  });
  assert.equal(out.action, "finish-explain");
}

/** 走完「划词 → 解释 → 成功」的完整路径。 */
function reachSuccess(s: SelectionSession, term = "闭包"): void {
  s.on({ kind: "selection-changed", selection: snap({ text: term }) });
  settleOk(s, startExplain(s, term));
}

describe("SelectionSession 基本流转", () => {
  it("初始 idle，划词后进入 ready 并给出入口", () => {
    const s = session();
    assert.equal(s.state, "idle");
    const out = s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.state, "ready");
    assert.equal(out.action, "show-ready");
  });

  it("折叠选区在 ready 时关闭", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const out = s.on({ kind: "selection-changed", selection: collapsed() });
    assert.equal(out.action, "close");
    assert.equal(s.state, "idle");
  });

  it("idle 状态下折叠选区不产生动作", () => {
    assert.equal(
      session().on({ kind: "selection-changed", selection: collapsed() }).action,
      "none",
    );
  });

  it("选区为空文本时关闭", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(
      s.on({ kind: "selection-changed", selection: snap({ text: "" }) }).action,
      "close",
    );
  });

  it("取不到选区（null）时关闭", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.on({ kind: "selection-changed", selection: null }).action, "close");
  });
});

describe("SelectionSession 无效选词", () => {
  it("超长选词给出提示而不是入口", () => {
    const s = session();
    const out = s.on({
      kind: "selection-changed",
      selection: snap({ text: "x".repeat(61) }),
    });
    assert.equal(out.action, "show-hint");
    assert.equal(s.state, "hint");
  });

  it("提示超时后关闭", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap({ text: "x".repeat(61) }) });
    assert.equal(s.on({ kind: "hint-timeout" }).action, "close");
  });

  it("非 hint 状态下 hint-timeout 无动作", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.on({ kind: "hint-timeout" }).action, "none");
  });

  it("rect 为 null 时不弹入口", () => {
    assert.equal(
      session().on({ kind: "selection-changed", selection: snap({ rect: null }) }).action,
      "none",
    );
  });
});

describe("SelectionSession 解释流程", () => {
  it("请求后进入 loading，结算成功后进入 success", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const seq = startExplain(s, "闭包");
    assert.equal(s.state, "loading");

    settleOk(s, seq);
    assert.equal(s.state, "success");
  });

  it("结算失败进入 error", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const seq = startExplain(s, "闭包");
    const out = s.on({
      kind: "explain-settled",
      seq,
      result: { ok: false, error: { code: "network", message: "连不上" } },
    });
    assert.equal(out.action, "finish-explain");
    assert.equal(s.state, "error");
  });

  it("过期响应被丢弃，不改变状态", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const seq = startExplain(s, "闭包");

    // 换一个词 → seq 递增，旧响应作废
    s.on({ kind: "selection-changed", selection: snap({ text: "柯里化" }) });
    const stale = s.on({
      kind: "explain-settled",
      seq,
      result: { ok: true, explanation: { professional: "P", plain: "L" } },
    });
    assert.equal(stale.action, "none");
    assert.equal(s.state, "ready");
  });
});

describe("SelectionSession 关闭与中断", () => {
  it("Esc 关闭非 idle 会话", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.on({ kind: "escape" }).action, "close");
  });

  it("idle 时 Esc 无动作", () => {
    assert.equal(session().on({ kind: "escape" }).action, "none");
  });

  it("close 事件关闭并清空", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    s.on({ kind: "close" });
    assert.equal(s.state, "idle");
    assert.equal(s.term, null);
    assert.equal(s.anchor, null);
  });

  it("anchor 滚出视口时关闭入口", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.on({ kind: "scroll", anchorInViewport: false }).action, "close");
  });

  it("anchor 仍在视口时不关闭", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    assert.equal(s.on({ kind: "scroll", anchorInViewport: true }).action, "none");
  });
});

describe("SelectionSession 指针交互", () => {
  it("拖选期间忽略 selectionchange", () => {
    const s = session();
    s.on({ kind: "pointer-down", insideOverlay: false, selection: collapsed() });
    assert.equal(s.on({ kind: "selection-changed", selection: snap() }).action, "none");
  });

  it("点击空白处（按下前后选区相同）不重弹入口", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const before = collapsed();
    s.on({ kind: "pointer-down", insideOverlay: false, selection: before });
    assert.equal(
      s.on({ kind: "pointer-up", insideOverlay: false, selection: before }).action,
      "none",
    );
  });

  it("success 状态下重新划页面上的词会开新会话", () => {
    const s = session();
    reachSuccess(s);
    const out = s.on({ kind: "selection-changed", selection: snap({ text: "柯里化" }) });
    assert.equal(out.action, "show-ready");
  });

  it("success 状态下划卡片正文内的词给出继续解释入口", () => {
    const s = session();
    reachSuccess(s);
    const out = s.on({
      kind: "selection-changed",
      selection: snap({ text: "柯里化", fromOverlay: true }),
    });
    assert.equal(out.action, "show-followup");
    assert.equal(s.state, "success");
  });

  it("卡片内选区清空时隐藏继续解释入口", () => {
    const s = session();
    reachSuccess(s);
    assert.equal(
      s.on({ kind: "selection-changed", selection: collapsedInOverlay() }).action,
      "hide-followup",
    );
  });

  it("pointer-cancel 重置拖选状态", () => {
    const s = session();
    s.on({ kind: "pointer-down", insideOverlay: false, selection: collapsed() });
    s.on({ kind: "pointer-cancel" });
    assert.equal(s.on({ kind: "selection-changed", selection: snap() }).action, "show-ready");
  });
});
