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
    const parsed =
      tryParseJson(text) ?? tryParseCodeFenceJson(text) ?? tryParseEmbeddedObject(text);
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
  const match = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  if (!match) return null;
  return tryParseJson(match[1] ?? "");
}

/** 模型在 JSON 前后加了说明时，取出第一个能解析成解释的对象。 */
function tryParseEmbeddedObject(text: string): unknown {
  for (const candidate of balancedObjects(text)) {
    const parsed = tryParseJson(candidate);
    if (toExplanation(parsed)) return parsed;
  }
  return null;
}

function balancedObjects(text: string): string[] {
  const results: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return results;
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
