import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anchorInViewport, computePlacement, type RectLike, type Size } from "./position-card.ts";

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

describe("anchorInViewport", () => {
  const screen: Size = { width: 1280, height: 800 };

  it("选区矩形在视口内时为 true", () => {
    assert.equal(anchorInViewport({ left: 100, right: 200, top: 100, bottom: 120 }, screen), true);
  });

  it("向上滚动出视口（bottom 高于顶部边距）时为 false", () => {
    // 模拟选区随页面向上滚走：当前 bottom 只剩 5px
    assert.equal(anchorInViewport({ left: 100, right: 200, top: -20, bottom: 5 }, screen), false);
  });

  it("向下滚动出视口（top 低于底部边距）时为 false", () => {
    assert.equal(anchorInViewport({ left: 100, right: 200, top: 850, bottom: 870 }, screen), false);
  });

  it("水平滚出视口时为 false", () => {
    assert.equal(
      anchorInViewport({ left: 1300, right: 1400, top: 100, bottom: 120 }, screen),
      false,
    );
    assert.equal(anchorInViewport({ left: -100, right: 4, top: 100, bottom: 120 }, screen), false);
  });

  it("取不到实时矩形（null）时按出视口处理", () => {
    assert.equal(anchorInViewport(null, screen), false);
  });

  it("边界值按严格比较：bottom 恰好等于边距不算可见", () => {
    assert.equal(anchorInViewport({ left: 100, right: 200, top: 0, bottom: 8 }, screen), false);
    assert.equal(anchorInViewport({ left: 100, right: 200, top: 792, bottom: 800 }, screen), false);
  });
});
