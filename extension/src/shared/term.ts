/** 选词长度上限：短文本保护，不做语义判断。 */
export const MAX_TERM_LENGTH = 60;

/** 选词过长或含换行时给用户看的提示。 */
export const INVALID_TERM_HINT = "请只选一个较短的词（60 字以内）";

/** 成对包裹标点的首部字符集（含中英文引号）。 */
const LEADING_WRAPPERS = /^[(（[{【《「『“‘"']+/;
/** 成对包裹标点的尾部字符集（含中英文引号）。 */
const TRAILING_WRAPPERS = /[)）\]}】》」』”’"']+$/;

/**
 * 清理选区文本：去掉首尾空白与成对包裹标点。
 * 返回 null 表示不可用（空、过长或含换行）。
 */
export function sanitizeTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let term = raw.trim();
  let previous: string;
  do {
    previous = term;
    term = term.replace(LEADING_WRAPPERS, "").replace(TRAILING_WRAPPERS, "");
  } while (term !== previous);
  term = term.trim();
  if (term.length === 0 || term.length > MAX_TERM_LENGTH) return null;
  if (term.includes("\n")) return null;
  return term;
}
