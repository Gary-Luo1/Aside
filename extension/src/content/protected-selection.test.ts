import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { containsNonSpaceText } from "./protected-selection.ts";

/** 构造结构化的假节点：Text 用 data，容器用 childNodes。 */
function node(over: { data?: unknown; childNodes?: unknown[] } = {}): object {
  return { ...over };
}

describe("containsNonSpaceText", () => {
  it("Text 节点带非空白文本时为 true", () => {
    assert.equal(containsNonSpaceText(node({ data: "闭包" })), true);
  });

  it("纯空白文本为 false", () => {
    assert.equal(containsNonSpaceText(node({ data: "  \t " })), false);
    assert.equal(containsNonSpaceText(node({ data: "" })), false);
  });

  it("data 非字符串（如元素的 data 属性为数字）不当文本", () => {
    assert.equal(containsNonSpaceText(node({ data: 42 })), false);
  });

  it("嵌套子树中的文本能找到", () => {
    const tree = node({
      childNodes: [node({ data: " " }), node({ childNodes: [node({ data: "词" })] })],
    });
    assert.equal(containsNonSpaceText(tree), true);
  });

  it("空容器与无子节点的元素为 false", () => {
    assert.equal(containsNonSpaceText(node({ childNodes: [] })), false);
    assert.equal(containsNonSpaceText(node({})), false);
  });

  it("子节点里有非对象项时跳过，不抛错", () => {
    const tree = node({ childNodes: ["text-not-node", null, node({ data: "词" })] });
    assert.equal(containsNonSpaceText(tree), true);
    const empty = node({ childNodes: ["  ", null, 1] });
    assert.equal(containsNonSpaceText(empty), false);
  });

  it("超过节点预算时保守返回 true，不深扫大子树", () => {
    // 100 个纯空白叶子：预算耗尽前扫不完，应保守判定为「有文本」
    const big = node({
      childNodes: Array.from({ length: 100 }, () => node({ data: " " })),
    });
    assert.equal(containsNonSpaceText(big), true);
    // 同样的树用大预算扫描，得出准确结论
    assert.equal(containsNonSpaceText(big, 500), false);
  });
});
