export function layoutFieldValues(value: unknown, path: string): unknown[] {
  let values: unknown[] = [value];
  for (const token of path.match(/[^.[\]]+|\[[^\]]*\]/g) ?? []) {
    values = values.flatMap((entry): unknown[] => {
      if (token === "[]") return Array.isArray(entry) ? entry : [];
      if (/^\[\d+\]$/.test(token))
        return Array.isArray(entry) && Number(token.slice(1, -1)) < entry.length
          ? [entry[Number(token.slice(1, -1))]]
          : [];
      if (token.startsWith("["))
        return entry && typeof entry === "object" && !Array.isArray(entry) ? Object.values(entry) : [];
      if (!entry || typeof entry !== "object") return [];
      const child = (entry as Record<string, unknown>)[token];
      return child === undefined ? [] : [child];
    });
  }
  return values;
}

export function layoutFieldSummary(value: unknown, path: string): string {
  const tupleItem = path.endsWith("[]") && /\.(points|ports|knots|ticks)\[\]$/.test(path);
  const values = layoutFieldValues(value, path.endsWith("[]") && !tupleItem ? path.slice(0, -2) : path);
  if (!values.length) return "—";
  const summaries = [
    ...new Set(
      values.map((entry) =>
        entry === null
          ? "null"
          : Array.isArray(entry)
            ? entry.every((v) => typeof v === "number" || v === null)
              ? JSON.stringify(entry)
              : `${entry.length} items`
            : typeof entry === "object"
              ? "object"
              : entry === ""
                ? '\"\"'
                : String(entry),
      ),
    ),
  ];
  return (
    summaries
      .slice(0, 3)
      .map((text) => (text.length > 90 ? `${text.slice(0, 87)}…` : text))
      .join(" · ") + (summaries.length > 3 ? ` · +${summaries.length - 3} values` : "")
  );
}
