import type { LocationInput, RecentLocation } from "./locations";

// Names are labels, never filesystem identity. An explicit ID is only a
// reconnection hint when its old handle is unavailable; a verifiable mismatch
// must get a different identity.
export async function resolveLocationIdentity(input: LocationInput, known: RecentLocation[], timeoutMs = 1000): Promise<string> {
  if (input.exampleId) return `example:${input.exampleId}`;
  const previous = known.find((item) => item.id === input.id && item.kind === input.kind);
  if (input.handle) {
    const exact = known.find((item) => item.kind === input.kind && item.handle === input.handle);
    if (exact) return exact.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const matches = await Promise.race([
        Promise.all(known.map(async (item) => {
          if (item.kind !== input.kind || !item.handle || !input.handle?.isSameEntry) return undefined;
          try { return await input.handle.isSameEntry(item.handle as FileSystemHandle) ? item.id : undefined; }
          catch { return undefined; }
        })),
        new Promise<undefined[]>((resolve) => { timer = setTimeout(() => resolve([]), timeoutMs); }),
      ]);
      const matched = matches.find((id) => id !== undefined);
      if (matched) return matched;
    } finally { clearTimeout(timer); }
  }
  if (input.id && !previous?.handle) return input.id;
  return crypto.randomUUID();
}
