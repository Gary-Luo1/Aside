/** 选词长度上限：短文本保护，不做语义判断。 */
export const MAX_TERM_LENGTH = 60;

/** 选词过长或含换行时给用户看的提示。 */
export const INVALID_TERM_HINT = "请只选一个较短的词（60 字以内）";

/** 成对包裹标点的首部字符集（含中英文引号）。 */
const LEADING_WRAPPERS = /^[(（[{【《「『“‘"']+/;
/** 成对包裹标点的尾部字符集（含中英文引号）。 */
const TRAILING_WRAPPERS = /[)）\]}】》」』”’"']+$/;
/** 换行以外的 C0 控制字符与 DEL：选区里混入时直接剔除；换行单独按无效处理。 */
// oxlint-disable-next-line no-control-regex -- 剔除控制字符正是本正则的目的
const CONTROL_CHARS = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/**
 * 清理选区文本：去掉控制字符、首尾空白与成对包裹标点。
 * 空白剔除放进循环，保证「括号—空格—引号」交替包裹也能剥干净。
 * 返回 null 表示不可用（空、过长或含换行）。
 */
export function sanitizeTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let term = raw.replace(CONTROL_CHARS, "");
  let previous: string;
  do {
    previous = term;
    term = term.trim().replace(LEADING_WRAPPERS, "").replace(TRAILING_WRAPPERS, "").trim();
  } while (term !== previous);
  if (term.length === 0 || term.length > MAX_TERM_LENGTH) return null;
  if (term.includes("\n")) return null;
  return term;
}
