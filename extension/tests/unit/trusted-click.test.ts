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

  it("closed shadow 收口到 host 时仍算命中入口", () => {
    const trigger = document.createElement("button");
    const host = document.createElement("div");
    const event = {
      isTrusted: true,
      composedPath: () => [host],
    } as unknown as Event;
    expect(isTrustedOverlayClick(event, trigger, host)).toBe(true);
  });
});
