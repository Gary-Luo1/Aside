import { describe, expect, it } from "vitest";
import { MAX_TERM_LENGTH, sanitizeTerm } from "../../src/shared/term";

describe("sanitizeTerm", () => {
  it("接受正常中文词", () => {
    expect(sanitizeTerm("算法")).toBe("算法");
  });

  it("接受英文缩写", () => {
    expect(sanitizeTerm("API")).toBe("API");
  });

  it("清理首尾空白", () => {
    expect(sanitizeTerm("  API  ")).toBe("API");
  });

  it("去掉首尾成对包裹标点", () => {
    expect(sanitizeTerm("「API」")).toBe("API");
    expect(sanitizeTerm("“算法”")).toBe("算法");
    expect(sanitizeTerm("(API)")).toBe("API");
    expect(sanitizeTerm("【开源】")).toBe("开源");
  });

  it("拒绝空选区", () => {
    expect(sanitizeTerm("   ")).toBeNull();
  });

  it("拒绝只剩标点的选区", () => {
    expect(sanitizeTerm("( )")).toBeNull();
  });

  it("拒绝含换行的选区", () => {
    expect(sanitizeTerm("API\nKey")).toBeNull();
  });

  it(`拒绝超过 ${MAX_TERM_LENGTH} 字符的选区`, () => {
    expect(sanitizeTerm("x".repeat(MAX_TERM_LENGTH + 1))).toBeNull();
  });

  it(`接受恰好 ${MAX_TERM_LENGTH} 字符的选区`, () => {
    expect(sanitizeTerm("x".repeat(MAX_TERM_LENGTH))).toHaveLength(MAX_TERM_LENGTH);
  });

  it("拒绝非字符串输入", () => {
    expect(sanitizeTerm(undefined)).toBeNull();
    expect(sanitizeTerm(123)).toBeNull();
  });
});
