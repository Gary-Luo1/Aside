import { describe, expect, it } from "vitest";
import { ProtectedSelectionRestorer } from "../../src/content/protected-selection";

describe("ProtectedSelectionRestorer", () => {
  it("重复 attach 只注册一次，detach 后不再响应", () => {
    const restorer = new ProtectedSelectionRestorer();
    restorer.attach();
    restorer.attach();
    restorer.detach();
    restorer.detach();
    expect(document.getElementById("iam-fine-selectable-style")).toBeNull();
  });

  it("松手后去掉本次可选标记", async () => {
    const p = document.createElement("p");
    p.textContent = "算法";
    p.style.userSelect = "none";
    document.body.append(p);
    const restorer = new ProtectedSelectionRestorer();
    restorer.attach();
    p.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
    expect(p.hasAttribute("data-iam-fine-selectable")).toBe(true);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(p.hasAttribute("data-iam-fine-selectable")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(p.hasAttribute("data-iam-fine-selectable")).toBe(false);
    restorer.detach();
    p.remove();
  });
});
