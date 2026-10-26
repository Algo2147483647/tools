/** Small deterministic identity for runtime snapshots; never persist graph contents in AI plan IDs. */
export function executionFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let first = 2166136261,
    second = 5381;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}
