import type { SelectionSnapshot } from "./session";

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
