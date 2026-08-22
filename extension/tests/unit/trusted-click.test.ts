import { describe, expect, it } from "vitest";
import { isTrustedOverlayClick } from "../../src/content/ui/trusted-click";

describe("isTrustedOverlayClick", () => {
  it("拒绝脚本合成的 click", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const event = new MouseEvent("click", { bubbles: true, composed: true });
    expect(event.isTrusted).toBe(false);
    expect(isTrustedOverlayClick(event, trigger)).toBe(false);
  });

  it("真实手势且命中入口时才通过", () => {
    const trigger = document.createElement("button");
    const event = {
      isTrusted: true,
      composedPath: () => [trigger],
    } as unknown as Event;
    expect(isTrustedOverlayClick(event, trigger)).toBe(true);
  });

  it("真实手势但未命中入口时拒绝", () => {
    const trigger = document.createElement("button");
    const other = document.createElement("div");
    const event = {
      isTrusted: true,
      composedPath: () => [other],
    } as unknown as Event;
    expect(isTrustedOverlayClick(event, trigger)).toBe(false);
  });

  it("closed shadow 收口到 host 时，只有命中入口才通过", () => {
    const trigger = document.createElement("button");
    const host = document.createElement("div");
    const close = document.createElement("button");
    const event = {
      isTrusted: true,
      composedPath: () => [host],
      clientX: 12,
      clientY: 8,
      detail: 1,
    } as unknown as Event;
    expect(
      isTrustedOverlayClick(event, trigger, {
        host,
        root: { elementFromPoint: () => trigger, activeElement: null },
      }),
    ).toBe(true);
    expect(
      isTrustedOverlayClick(event, trigger, {
        host,
        root: { elementFromPoint: () => close, activeElement: close },
      }),
    ).toBe(false);
  });

  it("closed shadow 收口到 host 时，键盘激活仍算命中入口", () => {
    const trigger = document.createElement("button");
    const host = document.createElement("div");
    const event = {
      isTrusted: true,
      composedPath: () => [host],
      clientX: 0,
      clientY: 0,
      detail: 0,
    } as unknown as Event;
    expect(
      isTrustedOverlayClick(event, trigger, {
        host,
        root: { elementFromPoint: () => trigger, activeElement: trigger },
      }),
    ).toBe(true);
  });

  it("键盘激活其它控件时，即使 (0,0) 落在入口上也不通过", () => {
    const trigger = document.createElement("button");
    const host = document.createElement("div");
    const close = document.createElement("button");
    const event = {
      isTrusted: true,
      composedPath: () => [host],
      clientX: 0,
      clientY: 0,
      detail: 0,
    } as unknown as Event;
    expect(
      isTrustedOverlayClick(event, trigger, {
        host,
        root: { elementFromPoint: () => trigger, activeElement: close },
      }),
    ).toBe(false);
  });
});
