import { describe, expect, it } from "vitest";
import {
  SelectionSession,
  type SelectionSnapshot,
} from "../../src/content/session";

function makeSession(sanitize?: (raw: string) => string | null): SelectionSession {
  return new SelectionSession({
    sanitizeTerm: sanitize ?? ((raw) => (raw.length <= 60 ? raw : null)),
  });
}

function snapshot(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  const anchorNode = document.createElement("span");
  const focusNode = document.createElement("span");
  return {
    collapsed: false,
    rangeCount: 1,
    text: "API",
    anchorNode,
    anchorOffset: 0,
    focusNode,
    focusOffset: 3,
    rect: { left: 10, right: 40, top: 20, bottom: 30 },
    ...overrides,
  };
}

const collapsed = (): SelectionSnapshot =>
  snapshot({ collapsed: true, rangeCount: 1, text: "", rect: { left: 0, right: 0, top: 0, bottom: 0 } });

const successResult = {
  ok: true,
  explanation: { professional: "定义", plain: "类比" },
} as const;

describe("SelectionSession 决策矩阵", () => {
  it("拖选进行中忽略 selectionchange，松手后按最终选区显示入口", () => {
    const session = makeSession();

    expect(session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() })).toEqual({
      action: "none",
    });
    expect(session.on({ kind: "selection-changed", selection: snapshot({ text: "算法" }) })).toEqual({
      action: "none",
    });

    const outcome = session.on({ kind: "pointer-up", insideOverlay: false, selection: snapshot({ text: "算法" }) });
    expect(outcome).toEqual({ action: "show-ready", term: "算法", anchor: expect.any(Object) });
  });

  it("键盘选词（无拖选）直接显示入口", () => {
    const session = makeSession();
    const outcome = session.on({ kind: "selection-changed", selection: snapshot() });
    expect(outcome).toEqual({ action: "show-ready", term: "API", anchor: expect.any(Object) });
  });

  it("点击页面空白处且选区未变时不重新弹出", () => {
    const session = makeSession();
    const current = snapshot();
    session.on({ kind: "selection-changed", selection: current });

    expect(session.on({ kind: "pointer-down", insideOverlay: false, selection: current })).toEqual({
      action: "close",
    });
    expect(session.on({ kind: "pointer-up", insideOverlay: false, selection: current })).toEqual({
      action: "none",
    });
  });

  it("超长/换行选词显示提示而非请求", () => {
    const session = makeSession();
    const outcome = session.on({
      kind: "selection-changed",
      selection: snapshot({ text: "x".repeat(61) }),
    });
    expect(outcome).toEqual({
      action: "show-hint",
      message: expect.stringContaining("较短的词"),
      anchor: expect.any(Object),
    });
    expect(session.state).toBe("hint");
  });

  it("提示超时后自动关闭", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot({ text: "x".repeat(61) }) });
    expect(session.on({ kind: "hint-timeout" })).toEqual({ action: "close" });
    expect(session.state).toBe("idle");
  });

  it("ready 状态下提示超时事件被忽略", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });
    expect(session.on({ kind: "hint-timeout" })).toEqual({ action: "none" });
  });

  it("滚动出视口关闭入口，入口在视口内保持", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });
    expect(session.on({ kind: "scroll", anchorInViewport: true })).toEqual({ action: "none" });
    expect(session.on({ kind: "scroll", anchorInViewport: false })).toEqual({ action: "close" });

    session.on({ kind: "selection-changed", selection: snapshot() });
    session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() });
    session.on({ kind: "pointer-up", insideOverlay: false, selection: snapshot({ text: "算法" }) });
    expect(session.on({ kind: "scroll", anchorInViewport: false })).toEqual({ action: "close" });
  });

  it("Escape 关闭非 idle 状态，idle 下无动作", () => {
    const session = makeSession();
    expect(session.on({ kind: "escape" })).toEqual({ action: "none" });
    session.on({ kind: "selection-changed", selection: snapshot() });
    expect(session.on({ kind: "escape" })).toEqual({ action: "close" });
  });

  it("过期响应被忽略，只有最新请求的结果生效", () => {
    const session = makeSession();
    const first = session.on({ kind: "explain-requested", term: "API" });
    expect(first).toEqual({ action: "start-explain", seq: 1, term: "API" });

    const second = session.on({ kind: "explain-requested", term: "算法" });
    expect(second).toEqual({ action: "start-explain", seq: 2, term: "算法" });

    expect(session.on({ kind: "explain-settled", seq: 1, result: successResult })).toEqual({
      action: "none",
    });
    const settled = session.on({ kind: "explain-settled", seq: 2, result: successResult });
    expect(settled).toMatchObject({ action: "finish-explain", term: "算法" });
    expect(session.state).toBe("success");
  });

  it("解释失败进入 error 态并携带错误", () => {
    const session = makeSession();
    const { seq } = session.on({ kind: "explain-requested", term: "API" }) as { seq: number };
    const result = { ok: false, error: { code: "network" as const, message: "网络错误" } };
    const outcome = session.on({ kind: "explain-settled", seq, result });
    expect(outcome).toMatchObject({ action: "finish-explain" });
    expect(session.state).toBe("error");
  });

  it("blur 时拖选兜底：按当前选区显示", () => {
    const session = makeSession();
    session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() });
    const outcome = session.on({ kind: "blur", selection: snapshot({ text: "算法" }) });
    expect(outcome).toEqual({ action: "show-ready", term: "算法", anchor: expect.any(Object) });
  });

  it("非拖选中的 blur 被忽略", () => {
    const session = makeSession();
    expect(session.on({ kind: "blur", selection: snapshot() })).toEqual({ action: "none" });
  });

  it("点击入口期间页面清空选区不关闭（suppress），点击落地后解除", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });

    session.on({ kind: "pointer-down", insideOverlay: true, selection: snapshot() });
    expect(session.on({ kind: "selection-changed", selection: collapsed() })).toEqual({ action: "none" });

    expect(session.on({ kind: "overlay-click" })).toEqual({ action: "none" });
    expect(session.on({ kind: "selection-changed", selection: collapsed() })).toEqual({ action: "close" });
  });

  it("点击 overlay 内部的 pointer-up 不触发任何动作", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });
    session.on({ kind: "pointer-down", insideOverlay: true, selection: snapshot() });
    expect(session.on({ kind: "pointer-up", insideOverlay: true, selection: snapshot() })).toEqual({
      action: "none",
    });
    expect(session.state).toBe("ready");
  });

  it("空选区/折叠关闭 ready 与 hint", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });
    expect(session.on({ kind: "selection-changed", selection: collapsed() })).toEqual({ action: "close" });

    session.on({ kind: "selection-changed", selection: snapshot({ text: "x".repeat(61) }) });
    expect(session.on({ kind: "selection-changed", selection: collapsed() })).toEqual({ action: "close" });
  });

  it("关闭后过期响应被忽略", () => {
    const session = makeSession();
    const { seq } = session.on({ kind: "explain-requested", term: "API" }) as { seq: number };
    expect(session.on({ kind: "close" })).toEqual({ action: "close" });
    expect(session.on({ kind: "explain-settled", seq, result: successResult })).toEqual({ action: "none" });
  });

  it("pointer-cancel 后恢复 selectionchange 处理", () => {
    const session = makeSession();
    session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() });
    expect(session.on({ kind: "pointer-cancel" })).toEqual({ action: "none" });
    expect(session.on({ kind: "selection-changed", selection: snapshot() })).toMatchObject({
      action: "show-ready",
    });
  });

  it("取不到选区时无条件关闭", () => {
    const session = makeSession();
    session.on({ kind: "selection-changed", selection: snapshot() });
    expect(session.on({ kind: "selection-changed", selection: null })).toEqual({ action: "close" });
  });

  it("注入的 sanitizeTerm 生效", () => {
    const session = makeSession((raw) => (raw === "Y" ? "X" : null));
    const outcome = session.on({ kind: "selection-changed", selection: snapshot({ text: "Y" }) });
    expect(outcome).toEqual({ action: "show-ready", term: "X", anchor: expect.any(Object) });
  });

  it("解释卡片内划词显示继续解释入口，不关掉当前卡片", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });
    expect(session.state).toBe("success");

    const inCard = snapshot({ text: "约定", fromOverlay: true });
    session.on({ kind: "pointer-down", insideOverlay: true, selection: collapsed() });
    const outcome = session.on({ kind: "pointer-up", insideOverlay: true, selection: inCard });
    expect(outcome).toEqual({ action: "show-followup", term: "约定", anchor: expect.any(Object) });
    expect(session.state).toBe("success");
    expect(session.term).toBe("API");
  });

  it("解释卡片内折叠选区只收起继续解释入口", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });

    session.on({
      kind: "selection-changed",
      selection: snapshot({ text: "约定", fromOverlay: true }),
    });
    expect(session.on({ kind: "selection-changed", selection: { ...collapsed(), fromOverlay: true } })).toEqual({
      action: "hide-followup",
    });
    expect(session.state).toBe("success");
  });

  it("解释展示时页面上的原选区不覆盖卡片", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });
    expect(session.on({ kind: "selection-changed", selection: snapshot({ text: "API" }) })).toEqual({
      action: "none",
    });
    expect(session.state).toBe("success");
  });

  it("解释展示时页面再划当前词不关卡，点空白才关", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });

    expect(session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() })).toEqual({
      action: "none",
    });
    expect(session.state).toBe("success");
    expect(session.on({ kind: "pointer-up", insideOverlay: false, selection: snapshot() })).toEqual({
      action: "none",
    });
    expect(session.state).toBe("success");

    session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() });
    expect(session.on({ kind: "pointer-up", insideOverlay: false, selection: collapsed() })).toEqual({
      action: "close",
    });
    expect(session.state).toBe("idle");
  });

  it("解释展示时在页面另选新词则换入口", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });
    expect(session.on({ kind: "selection-changed", selection: snapshot({ text: "数据库" }) })).toEqual({
      action: "show-ready",
      term: "数据库",
      anchor: expect.any(Object),
    });
    expect(session.state).toBe("ready");
  });

  it("解释展示时页面拖选新词在松手后换入口", () => {
    const session = makeSession();
    const started = session.on({ kind: "explain-requested", term: "API" });
    const seq = (started as { seq: number }).seq;
    session.on({ kind: "explain-settled", seq, result: successResult });
    expect(session.on({ kind: "pointer-down", insideOverlay: false, selection: snapshot() })).toEqual({
      action: "none",
    });
    expect(session.on({ kind: "pointer-up", insideOverlay: false, selection: snapshot({ text: "数据库" }) })).toEqual({
      action: "show-ready",
      term: "数据库",
      anchor: expect.any(Object),
    });
    expect(session.state).toBe("ready");
  });
});
