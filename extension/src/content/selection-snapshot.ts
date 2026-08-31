import type { SelectionSnapshot } from "./session.ts";

/**
 * 合并卡片正文选区与页面选区。
 * 页面上另选了新词时以页面为准（含键盘选词）；卡片标题/页脚选区不当作页面选区。
 */
export function pickSelectionSnapshot(
  fromCard: SelectionSnapshot | null,
  fromWindow: SelectionSnapshot | null,
  overlayContainsNode: (node: Node | null) => boolean,
): SelectionSnapshot | null {
  const pageSelection =
    fromWindow &&
    !fromWindow.collapsed &&
    fromWindow.text.length > 0 &&
    fromWindow.anchorNode !== null &&
    !overlayContainsNode(fromWindow.anchorNode)
      ? fromWindow
      : null;
  if (pageSelection) return pageSelection;
  if (fromCard) return fromCard;
  if (fromWindow?.anchorNode && overlayContainsNode(fromWindow.anchorNode)) {
    return {
      collapsed: true,
      rangeCount: 0,
      text: "",
      anchorNode: fromWindow.anchorNode,
      anchorOffset: fromWindow.anchorOffset,
      focusNode: fromWindow.focusNode,
      focusOffset: fromWindow.focusOffset,
      rect: null,
      fromOverlay: true,
    };
  }
  return fromWindow;
}

/**
 * 从任意 Selection 提取不可变快照。
 * rect 为 0×0 时记 null（调用方据此跳过定位）。
 * fromOverlay 标记该选区是否落在解释卡片内。
 */
export function snapshotSelection(selection: Selection, fromOverlay = false): SelectionSnapshot {
  const anchorNode = selection.anchorNode;
  const anchorOffset = selection.anchorOffset;
  const focusNode = selection.focusNode;
  const focusOffset = selection.focusOffset;
  if (selection.rangeCount === 0) {
    return {
      collapsed: true,
      rangeCount: 0,
      text: "",
      anchorNode,
      anchorOffset,
      focusNode,
      focusOffset,
      rect: null,
      fromOverlay,
    };
  }
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return {
    collapsed: selection.isCollapsed,
    rangeCount: selection.rangeCount,
    text: selection.toString(),
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
    fromOverlay,
    rect:
      rect.width === 0 && rect.height === 0
        ? null
        : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
  };
}
