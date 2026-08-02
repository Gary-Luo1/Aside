import { describe, expect, it } from "vitest";
import { computePlacement } from "../../src/content/position-card";

const viewport = { width: 1440, height: 900 };
const size = { width: 660, height: 300 };

describe("computePlacement", () => {
  it("下方空间足够时显示在选区下方", () => {
    const anchor = { left: 200, right: 280, top: 300, bottom: 320 };
    const result = computePlacement(anchor, size, viewport);
    expect(result.top).toBe(332);
  });

  it("下方空间不足时翻到选区上方", () => {
    const anchor = { left: 200, right: 280, top: 700, bottom: 720 };
    const result = computePlacement(anchor, size, viewport);
    expect(result.top).toBe(700 - 12 - 300);
  });

  it("上下都不足时贴顶部", () => {
    const anchor = { left: 200, right: 280, top: 10, bottom: 30 };
    const result = computePlacement(anchor, { width: 660, height: 1200 }, viewport);
    expect(result.top).toBe(16);
  });

  it("卡片超出视口高度时保持 16px 边距", () => {
    const result = computePlacement(
      { left: 200, right: 280, top: 850, bottom: 870 },
      { width: 660, height: 1000 },
      viewport,
    );
    expect(result.top).toBe(16);
  });

  it("选区贴近左侧时 clamp 到 16px", () => {
    const anchor = { left: 0, right: 10, top: 300, bottom: 320 };
    const result = computePlacement(anchor, size, viewport);
    expect(result.left).toBe(16);
  });

  it("选区贴近右侧时卡片不超出视口", () => {
    const anchor = { left: 1400, right: 1430, top: 300, bottom: 320 };
    const result = computePlacement(anchor, size, viewport);
    expect(result.left + size.width).toBeLessThanOrEqual(viewport.width);
    expect(result.left).toBe(viewport.width - size.width - 16);
  });

  it("返回整数坐标", () => {
    const result = computePlacement(
      { left: 200.4, right: 280.6, top: 300.2, bottom: 320.8 },
      size,
      viewport,
    );
    expect(Number.isInteger(result.left)).toBe(true);
    expect(Number.isInteger(result.top)).toBe(true);
  });
});
