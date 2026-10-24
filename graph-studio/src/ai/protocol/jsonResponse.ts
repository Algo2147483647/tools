export function extractJsonObject(raw: string): string {
  const trimmed = stripJsonFence(raw.trim());
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("AI response did not contain JSON.");
}

function stripJsonFence(value: string): string {
  const fenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : value;
}

export function formatJsonParseError(error: unknown, source: string): string {
  const nativeMessage = error instanceof Error ? error.message : "Invalid JSON.";
  const position = extractJsonErrorPosition(nativeMessage);
  const location = position === null ? "" : ` near ${formatJsonLocation(source, position)}`;
  const snippet = position === null ? "" : ` Snippet: ${JSON.stringify(buildJsonErrorSnippet(source, position))}`;
  return [
    `AI response contained invalid JSON${location}: ${nativeMessage}.`,
    'Command strings must escape nested double quotes, for example: /set Water define \\"2H2 + O2 -> 2H2O\\".',
    snippet,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractJsonErrorPosition(message: string): number | null {
  const match = message.match(/position\s+(\d+)/i);
  if (!match) {
    return null;
  }
  const position = Number(match[1]);
  return Number.isInteger(position) && position >= 0 ? position : null;
}

function formatJsonLocation(source: string, position: number): string {
  const before = source.slice(0, position);
  const line = before.split(/\r?\n/).length;
  const lastLineBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  const column = position - lastLineBreak;
  return `line ${line}, column ${column}`;
}

function buildJsonErrorSnippet(source: string, position: number): string {
  const start = Math.max(0, position - 80);
  const end = Math.min(source.length, position + 80);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}
