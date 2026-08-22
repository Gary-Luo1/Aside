import { describe, expect, it } from "vitest";
import { pickSelectionSnapshot } from "../../src/content/selection-snapshot";
import type { SelectionSnapshot } from "../../src/content/session";

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

describe("pickSelectionSnapshot", () => {
  it("页面另选新词时优先用页面选区，即使卡片正文仍有选区", () => {
    const cardNode = document.createElement("p");
    const pageNode = document.createElement("span");
    const fromCard = snapshot({ text: "约定", fromOverlay: true, anchorNode: cardNode, focusNode: cardNode });
    const fromWindow = snapshot({ text: "数据库", anchorNode: pageNode, focusNode: pageNode });
    const picked = pickSelectionSnapshot(fromCard, fromWindow, (node) => node === cardNode);
    expect(picked?.text).toBe("数据库");
    expect(picked?.fromOverlay).toBeUndefined();
  });

  it("卡片标题/页脚选区不当成页面选区", () => {
    const titleNode = document.createElement("span");
    const fromWindow = snapshot({ text: "aside", anchorNode: titleNode, focusNode: titleNode });
    const picked = pickSelectionSnapshot(null, fromWindow, (node) => node === titleNode);
    expect(picked).toMatchObject({ collapsed: true, text: "", fromOverlay: true });
  });

  it("只有卡片正文选区时沿用卡片选区", () => {
    const cardNode = document.createElement("p");
    const fromCard = snapshot({ text: "约定", fromOverlay: true, anchorNode: cardNode, focusNode: cardNode });
    const fromWindow = snapshot({ collapsed: true, text: "", rangeCount: 0, rect: null });
    const picked = pickSelectionSnapshot(fromCard, fromWindow, (node) => node === cardNode);
    expect(picked).toBe(fromCard);
  });
});
