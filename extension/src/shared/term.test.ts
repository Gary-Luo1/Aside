import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_TERM_LENGTH, sanitizeTerm } from "./term.ts";

describe("sanitizeTerm", () => {
  it("去掉首尾空白", () => {
    assert.equal(sanitizeTerm("  API  "), "API");
  });

  it("剥掉中文引号", () => {
    assert.equal(sanitizeTerm("“闭包”"), "闭包");
    assert.equal(sanitizeTerm("‘闭包’"), "闭包");
  });

  it("剥掉英文引号", () => {
    assert.equal(sanitizeTerm('"API"'), "API");
    assert.equal(sanitizeTerm("'API'"), "API");
  });

  it("剥掉括号类包裹符号", () => {
    assert.equal(sanitizeTerm("（闭包）"), "闭包");
    assert.equal(sanitizeTerm("[闭包]"), "闭包");
  });

  it("剥掉嵌套的多层包裹", () => {
    assert.equal(sanitizeTerm("【《闭包》】"), "闭包");
  });

  it("保留词内的符号", () => {
    assert.equal(sanitizeTerm("C++"), "C++");
    assert.equal(sanitizeTerm("a.b"), "a.b");
  });

  it("空白内容返回 null", () => {
    assert.equal(sanitizeTerm("   "), null);
    assert.equal(sanitizeTerm(""), null);
  });

  it("含换行返回 null", () => {
    assert.equal(sanitizeTerm("前\n后"), null);
    assert.equal(sanitizeTerm("前\r\n后"), null);
  });

  it("超过长度上限返回 null", () => {
    assert.equal(sanitizeTerm("a".repeat(MAX_TERM_LENGTH + 1)), null);
  });

  it("正好等于上限时通过", () => {
    assert.equal(sanitizeTerm("a".repeat(MAX_TERM_LENGTH))?.length, MAX_TERM_LENGTH);
  });

  it("非字符串输入返回 null", () => {
    assert.equal(sanitizeTerm(123), null);
    assert.equal(sanitizeTerm(null), null);
    assert.equal(sanitizeTerm(undefined), null);
    assert.equal(sanitizeTerm({}), null);
    assert.equal(sanitizeTerm([]), null);
  });
});
