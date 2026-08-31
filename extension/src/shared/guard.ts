/**
 * 可信边界的通用收窄：把 unknown 判成普通对象。
 * 排除 null 与所有原始类型；数组也会判为 true（调用方按需自行排除）。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
