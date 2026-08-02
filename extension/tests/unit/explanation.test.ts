import { describe, expect, it } from "vitest";
import { MAX_EXPLANATION_LENGTH, parseExplanation } from "../../src/shared/explanation";

describe("parseExplanation", () => {
  it("解析正常 JSON 字符串", () => {
    expect(parseExplanation('{"professional":"定义","plain":"类比"}')).toEqual({
      professional: "定义",
      plain: "类比",
    });
  });

  it("允许外层 Markdown code fence", () => {
    const fenced = '```json\n{"professional":"定义","plain":"类比"}\n```';
    expect(parseExplanation(fenced)).toEqual({ professional: "定义", plain: "类比" });
  });

  it("接受直接传入对象", () => {
    expect(parseExplanation({ professional: "定义", plain: "类比" })).toEqual({
      professional: "定义",
      plain: "类比",
    });
  });

  it("拒绝缺字段", () => {
    expect(parseExplanation('{"professional":"定义"}')).toBeNull();
    expect(parseExplanation('{"plain":"类比"}')).toBeNull();
  });

  it("拒绝空内容或字段为空白", () => {
    expect(parseExplanation('{"professional":"","plain":"类比"}')).toBeNull();
    expect(parseExplanation("")).toBeNull();
    expect(parseExplanation("   ")).toBeNull();
  });

  it("拒绝非 JSON", () => {
    expect(parseExplanation("这不是 JSON")).toBeNull();
    expect(parseExplanation("```json\nnot json\n```")).toBeNull();
  });

  it("拒绝字段类型错误", () => {
    expect(parseExplanation('{"professional":123,"plain":"类比"}')).toBeNull();
  });

  it("拒绝非对象输入", () => {
    expect(parseExplanation(42)).toBeNull();
    expect(parseExplanation(["professional"])).toBeNull();
  });

  it(`拒绝超过 ${MAX_EXPLANATION_LENGTH} 字符的解释`, () => {
    const long = "x".repeat(MAX_EXPLANATION_LENGTH + 1);
    expect(parseExplanation({ professional: long, plain: "类比" })).toBeNull();
    expect(parseExplanation({ professional: "定义", plain: long })).toBeNull();
  });

  it(`接受恰好 ${MAX_EXPLANATION_LENGTH} 字符的解释`, () => {
    const exact = "x".repeat(MAX_EXPLANATION_LENGTH);
    expect(parseExplanation({ professional: exact, plain: "类比" })).toEqual({
      professional: exact,
      plain: "类比",
    });
  });
});
