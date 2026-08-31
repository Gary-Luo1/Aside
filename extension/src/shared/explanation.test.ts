import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_EXPLANATION_LENGTH, parseExplanation } from "./explanation.ts";

describe("parseExplanation", () => {
  it("解析纯 JSON 字符串", () => {
    assert.deepEqual(parseExplanation('{"professional":"A","plain":"B"}'), {
      professional: "A",
      plain: "B",
    });
  });

  it("解析带 json code fence 的输出", () => {
    assert.deepEqual(parseExplanation('```json\n{"professional":"A","plain":"B"}\n```'), {
      professional: "A",
      plain: "B",
    });
  });

  it("解析不带语言标记的 code fence", () => {
    assert.deepEqual(parseExplanation('```\n{"professional":"A","plain":"B"}\n```'), {
      professional: "A",
      plain: "B",
    });
  });

  it("直接接受对象", () => {
    assert.deepEqual(parseExplanation({ professional: "A", plain: "B" }), {
      professional: "A",
      plain: "B",
    });
  });

  it("缺字段返回 null", () => {
    assert.equal(parseExplanation({ professional: "A" }), null);
    assert.equal(parseExplanation({ plain: "B" }), null);
  });

  it("字段类型错误返回 null", () => {
    assert.equal(parseExplanation({ professional: 1, plain: 2 }), null);
  });

  it("空白字段返回 null", () => {
    assert.equal(parseExplanation({ professional: "   ", plain: "B" }), null);
    assert.equal(parseExplanation({ professional: "A", plain: "" }), null);
  });

  it("超长时截断而不是整条作废", () => {
    const result = parseExplanation({
      professional: "x".repeat(MAX_EXPLANATION_LENGTH + 500),
      plain: "B",
    });
    assert.ok(result);
    assert.equal(result.professional.length, MAX_EXPLANATION_LENGTH + 1);
    assert.ok(result.professional.endsWith("…"));
    assert.equal(result.plain, "B");
  });

  it("未超长时不加省略号", () => {
    const result = parseExplanation({ professional: "A", plain: "B" });
    assert.equal(result?.professional, "A");
  });

  it("非法 JSON 返回 null", () => {
    assert.equal(parseExplanation("{not json"), null);
  });

  it("非对象非字符串返回 null", () => {
    assert.equal(parseExplanation(42), null);
    assert.equal(parseExplanation(null), null);
    assert.equal(parseExplanation(undefined), null);
  });
});
