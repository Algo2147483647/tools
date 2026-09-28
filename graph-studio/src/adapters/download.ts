export function downloadTextFile(content: string, fileName: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonFile(content: string, fileName: string): void {
  downloadTextFile(content, fileName, "application/json;charset=utf-8");
}

export function ensureJsonExtension(fileName: string): string {
  const name = String(fileName || "graph").trim() || "graph";
  return /\.json$/i.test(name) ? name : `${name}.json`;
}

export function buildTimestampFileName(fileName: string, date = new Date()): string {
  const normalizedName = ensureJsonExtension(fileName || "graph.json");
  const match = normalizedName.match(/^(.*?)(\.json)$/i);
  const baseName = match ? match[1] : normalizedName;
  const extension = match ? match[2] : ".json";
  return `${baseName}-${formatTimestamp(date)}${extension}`;
}

function formatTimestamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}
