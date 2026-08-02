export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
}

const VIEWPORT_MARGIN = 16;
const GAP = 12;

/**
 * 计算解释卡片/入口位置：优先选区下方 12px；下方空间不足时翻到上方；
 * 始终限制在可视区域内且距视口边缘至少 16px。
 */
export function computePlacement(
  anchor: RectLike,
  size: Size,
  viewport: Size,
  gap = GAP,
): Placement {
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchor.left, viewport.width - size.width - VIEWPORT_MARGIN),
  );

  let top = anchor.bottom + gap;
  if (top + size.height + VIEWPORT_MARGIN > viewport.height) {
    top = anchor.top - gap - size.height;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
  }
  if (top + size.height > viewport.height) {
    top = Math.max(VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN);
  }

  return { left: Math.round(maxLeft), top: Math.round(top) };
}
