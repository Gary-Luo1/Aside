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

describe("SelectionSession 取消在途请求", () => {
  it("loading 中关闭：要求取消在途请求", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    startExplain(s, "闭包");
    const out = s.on({ kind: "close" });
    assert.equal(out.action, "close");
    if (out.action === "close") assert.equal(out.cancelInFlight, true);
  });

  it("loading 中换词：入口替换加载卡片，并取消旧请求", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    startExplain(s, "闭包");
    const out = s.on({ kind: "selection-changed", selection: snap({ text: "柯里化" }) });
    assert.equal(out.action, "show-ready");
    if (out.action === "show-ready") assert.equal(out.cancelInFlight, true);
  });

  it("loading 中选了超长词：提示出现并取消旧请求", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    startExplain(s, "闭包");
    const out = s.on({ kind: "selection-changed", selection: snap({ text: "x".repeat(61) }) });
    assert.equal(out.action, "show-hint");
    if (out.action === "show-hint") assert.equal(out.cancelInFlight, true);
  });

  it("没有在途请求时的普通关闭不要求取消", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const out = s.on({ kind: "close" });
    assert.equal(out.action, "close");
    if (out.action === "close") assert.equal(out.cancelInFlight, false);
  });

  it("结算完成后再关闭不要求取消", () => {
    const s = session();
    reachSuccess(s);
    const out = s.on({ kind: "close" });
    if (out.action === "close") assert.equal(out.cancelInFlight, false);
  });

  it("取消作废 seq：随后到达的旧响应被丢弃", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() });
    const seq = startExplain(s, "闭包");
    s.on({ kind: "close" });
    const stale = s.on({
      kind: "explain-settled",
      seq,
      result: { ok: true, explanation: { professional: "P", plain: "L" } },
    });
    assert.equal(stale.action, "none");
    assert.equal(s.state, "idle");
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

  it("点击清空卡片内选区：click 后补的塌陷同步隐藏继续解释入口", () => {
    const s = session();
    reachSuccess(s);
    const selected = snap({ text: "柯里化", fromOverlay: true });
    s.on({ kind: "pointer-down", insideOverlay: true, selection: selected });
    // 塌陷发生在按下期间，selectionchange 被拖选过滤器丢弃
    assert.equal(s.on({ kind: "selection-changed", selection: selected }).action, "none");
    assert.equal(
      s.on({ kind: "pointer-up", insideOverlay: true, selection: collapsedInOverlay() }).action,
      "none",
    );
    // controller 在 click 后补发同步，session 据此隐藏入口
    s.on({ kind: "overlay-click" });
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

  it("卡片内按下、卡外松开：塌陷关闭不再被长期抑制", () => {
    const s = session();
    s.on({ kind: "selection-changed", selection: snap() }); // ready
    s.on({ kind: "pointer-down", insideOverlay: true, selection: snap() });
    // click 目标落在公共祖先上不会命中 overlay，等价于收不到 overlay-click 复位
    s.on({ kind: "pointer-up", insideOverlay: false, selection: collapsed() });
    assert.equal(s.on({ kind: "selection-changed", selection: collapsed() }).action, "close");
  });
});

describe("SelectionSession 对抗性时序", () => {
  it("入口点击会把塌陷选区的浏览器打成 loading：click 补同步不得打断解释", () => {
    const s = session();
    const selected = snap();
    s.on({ kind: "selection-changed", selection: selected });
    // 部分浏览器里点击入口按钮会塌陷页面选区
    s.on({ kind: "pointer-down", insideOverlay: true, selection: selected });
    assert.equal(s.on({ kind: "selection-changed", selection: selected }).action, "none");
    assert.equal(
      s.on({ kind: "pointer-up", insideOverlay: true, selection: collapsed() }).action,
      "none",
    );
    // 现行顺序：window 捕获的 overlay-click 处理器先于 trigger 处理器执行；
    // 控制器在 ready 状态不补发塌陷同步，这里只复位拖选标志
    s.on({ kind: "overlay-click" });
    const out = s.on({ kind: "explain-requested", term: "闭包" });
    assert.equal(out.action, "start-explain");
    assert.equal(s.state, "loading");
    // 兜底：即使塌陷同步晚于 explain-requested 到达，也不得打断 loading
    assert.equal(s.on({ kind: "selection-changed", selection: collapsed() }).action, "none");
    assert.equal(s.state, "loading");
    settleOk(s, out.seq);
    assert.equal(s.state, "success");
  });

  it("入口点击后选区未塌陷（常见路径）：click 补同步直接跳过", () => {
    const s = session();
    const selected = snap();
    s.on({ kind: "selection-changed", selection: selected });
    s.on({ kind: "pointer-down", insideOverlay: true, selection: selected });
    s.on({ kind: "pointer-up", insideOverlay: true, selection: selected });
    const out = s.on({ kind: "explain-requested", term: "闭包" });
    assert.equal(out.action, "start-explain");
    // controller 守卫：非空选区不补发；即使补发了，loading 下非空有效词也不应回 ready
    assert.equal(
      s.on({ kind: "selection-changed", selection: snap({ text: "柯里化" }) }).action,
      "show-ready",
    );
    // 说明：loading 状态下外部再报有效选词会开新会话，这是既有语义；
    // controller 的守卫保证 trigger 自身的点击不会走到这一步。
    assert.equal(s.state, "ready");
  });

  it("success 下点击卡片外页面：卡片与入口一起关闭，无残留", () => {
    const s = session();
    reachSuccess(s);
    s.on({ kind: "selection-changed", selection: snap({ text: "柯里化", fromOverlay: true }) });
    // 点击页面空白：pointerdown 在卡片外
    s.on({
      kind: "pointer-down",
      insideOverlay: false,
      selection: snap({ text: "柯里化", fromOverlay: true }),
    });
    assert.equal(
      s.on({ kind: "selection-changed", selection: snap({ text: "柯里化", fromOverlay: true }) })
        .action,
      "none",
    );
    const out = s.on({ kind: "pointer-up", insideOverlay: false, selection: collapsed() });
    assert.equal(out.action, "close");
    assert.equal(s.state, "idle");
  });

  it("hint 状态下点击提示本体：click 补同步把提示一并关闭", () => {
    const s = session();
    // 超长多行选词 → hint
    assert.equal(
      s.on({ kind: "selection-changed", selection: snap({ text: "一\n二\n三" }) }).action,
      "show-hint",
    );
    s.on({ kind: "pointer-down", insideOverlay: true, selection: snap({ text: "一\n二\n三" }) });
    assert.equal(
      s.on({ kind: "pointer-up", insideOverlay: true, selection: collapsed() }).action,
      "none",
    );
    s.on({ kind: "overlay-click" });
    assert.equal(s.on({ kind: "selection-changed", selection: collapsed() }).action, "close");
    assert.equal(s.state, "idle");
  });

  it("卡片内拖选后不松手直接滚出视口：入口跟随关闭语义不适用于 followup", () => {
    const s = session();
    reachSuccess(s);
    assert.equal(
      s.on({ kind: "selection-changed", selection: snap({ text: "柯里化", fromOverlay: true }) })
        .action,
      "show-followup",
    );
    // scroll 只在 ready/hint 下关闭；success 保持不动
    assert.equal(s.on({ kind: "scroll", anchorInViewport: false }).action, "none");
    assert.equal(s.state, "success");
  });
});
