import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePlacement, type RectLike, type Size } from "./position-card.ts";

const viewport: Size = { width: 1280, height: 800 };
const anchor: RectLike = { left: 100, right: 200, top: 100, bottom: 120 };

describe("computePlacement", () => {
  it("空间足够时放在选区下方 12px", () => {
    const p = computePlacement(anchor, { width: 400, height: 200 }, viewport);
    assert.equal(p.top, 132);
  });

  it("默认水平对齐选区左边缘", () => {
    const p = computePlacement(anchor, { width: 400, height: 200 }, viewport);
    assert.equal(p.left, 100);
  });

  it("下方空间不足时翻到选区上方", () => {
    const p = computePlacement(
      { left: 100, right: 200, top: 700, bottom: 720 },
      { width: 400, height: 200 },
      viewport,
    );
    assert.equal(p.top, 700 - 12 - 200);
  });

  it("右侧超出视口时左移，保持 16px 边距", () => {
    const p = computePlacement(
      { left: 1200, right: 1260, top: 100, bottom: 120 },
      { width: 400, height: 200 },
      viewport,
    );
    assert.equal(p.left, viewport.width - 400 - 16);
  });

  it("卡片比视口还宽时贴到左边距", () => {
    const p = computePlacement(anchor, { width: 2000, height: 200 }, viewport);
    assert.equal(p.left, 16);
  });

  it("卡片比视口还高时夹在视口内", () => {
    const p = computePlacement(anchor, { width: 400, height: 2000 }, viewport);
    assert.ok(p.top >= 16);
  });

  it("坐标取整，避免半像素模糊", () => {
    const p = computePlacement(
      { left: 100.4, right: 200.6, top: 100.3, bottom: 120.7 },
      { width: 400, height: 200 },
      viewport,
    );
    assert.ok(Number.isInteger(p.left));
    assert.ok(Number.isInteger(p.top));
  });

  it("自定义 gap 生效", () => {
    const p = computePlacement(anchor, { width: 400, height: 200 }, viewport, 40);
    assert.equal(p.top, 160);
  });
});
