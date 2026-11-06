/** Catalog and rendered controls use the same case-insensitive word matching. */
export function matchesSettingsQuery(text: string, query: string) {
  const haystack = text.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
