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

/** 判断「选区当前是否在视口内」用的边距：滚动关闭入口时使用。 */
const ANCHOR_VIEWPORT_MARGIN = 8;

/**
 * 判断选区矩形当前是否落在视口内（滚动关闭入口用）。
 * rect 为 null（取不到实时选区或 0×0）时视为不在：调用方据此关闭入口。
 * 注意必须传入“当前”矩形——选区时刻的旧坐标在滚动后毫无意义。
 */
export function anchorInViewport(rect: RectLike | null, viewport: Size): boolean {
  if (rect === null) return false;
  return (
    rect.bottom > ANCHOR_VIEWPORT_MARGIN &&
    rect.top < viewport.height - ANCHOR_VIEWPORT_MARGIN &&
    rect.right > ANCHOR_VIEWPORT_MARGIN &&
    rect.left < viewport.width - ANCHOR_VIEWPORT_MARGIN
  );
}

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
