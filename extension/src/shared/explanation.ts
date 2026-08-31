import type { Explanation } from "./messages.ts";
import { isRecord } from "./guard.ts";

/** 单段解释长度上限：防止模型返回超长内容拖慢渲染。 */
export const MAX_EXPLANATION_LENGTH = 2_000;

/**
 * 解析模型输出为 Explanation。
 * 允许移除外层 Markdown code fence；字段缺失或类型错误时返回 null，不猜测缺失字段。
 * 单段超长时截断保留，而不是整条作废。
 */
export function parseExplanation(raw: unknown): Explanation | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text.length === 0) return null;
    const parsed = tryParseJson(text) ?? tryParseCodeFenceJson(text);
    return toExplanation(parsed);
  }
  if (typeof raw === "object" && raw !== null) {
    return toExplanation(raw);
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tryParseCodeFenceJson(text: string): unknown {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (!match) return null;
  return tryParseJson(match[1] ?? "");
}

function toExplanation(value: unknown): Explanation | null {
  if (!isRecord(value)) return null;
  const professional = typeof value.professional === "string" ? value.professional.trim() : "";
  const plain = typeof value.plain === "string" ? value.plain.trim() : "";
  if (professional.length === 0 || plain.length === 0) return null;
  return { professional: clamp(professional), plain: clamp(plain) };
}

/** 超长时截断到上限并加省略号，避免模型啰嗦时整条解释作废。 */
function clamp(text: string): string {
  if (text.length <= MAX_EXPLANATION_LENGTH) return text;
  return `${text.slice(0, MAX_EXPLANATION_LENGTH).trimEnd()}…`;
}
