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
});
