import { parseWorkspaceManifest, WORKSPACE_MANIFEST } from "./discovery";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";

export const EXAMPLE_WORKSPACES = [
  {
    id: "china-history",
    title: "中国历史：分流与交汇",
    kind: "Timeline",
    description: "从先秦到当代，观察政权分合、制度变迁、政治运动、社会生活与国际关系。每个历史节点附有来源。",
    detail: "674 events & periods · 1068 relationships · c. 1750 BCE–2026",
    accent: "#a36c43",
  },
  {
    id: "commerce",
    title: "Commerce operations",
    kind: "Nested node-link",
    description:
      "Explore checkout, payments, warehouse, delivery and returns. Expand domain boundaries and trace their original relationships.",
    detail: "32 nodes · 14 groups · 3 journeys",
    accent: "#527f82",
  },
  {
    id: "mathematics",
    title: "Mathematics",
    kind: "Knowledge graph",
    description:
      "Analysis, algebra, probability, foundations, and geometry. Explore scoped theorems, study notes, and references.",
    detail: "202 concepts · 10 subjects",
    accent: "#5576a9",
  },
  {
    id: "space-history",
    title: "World space history",
    kind: "Timeline",
    description:
      "Follow satellites, lunar landings, space stations and deep-space missions. Zoom from decades of exploration to Eagle and Columbia's rendezvous.",
    detail: "298 events & phases · One timeline · 1957–2025",
    accent: "#6675a8",
  },
  {
    id: "factorio",
    title: "Factorio production",
    kind: "Sankey diagrams",
    description:
      "Trace all 12 science packs at 1 each/s back to raw resources, or explore a complete launch-ready rocket production plan.",
    detail: "2 production targets · Space Age 2.0.65",
    accent: "#3e948a",
  },
] as const;

export function isExampleId(id: unknown): id is string {
  return EXAMPLE_WORKSPACES.some((example) => example.id === id);
}

// File objects are immutable. Share downloads, never editable graph documents or file maps.
const downloads = new WeakMap<typeof fetch, Map<string, Map<string, Promise<File>>>>();

/** Open graph documents now; linked notes and other assets load when requested. */
export async function loadExampleWorkspace(
  id: string,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  options: { reload?: boolean; timeoutMs?: number } = {},
): Promise<WorkspaceFolder> {
  const example = EXAMPLE_WORKSPACES.find((entry) => entry.id === id);
  if (!example) throw new Error("Unknown example workspace.");
  const root = `${baseUrl}examples/${id}/`;
  let roots = downloads.get(fetcher);
  if (!roots) downloads.set(fetcher, (roots = new Map()));
  if (options.reload || !roots.has(root)) roots.set(root, new Map());
  const cache = roots.get(root)!;
  function read(path: string): Promise<File> {
    const cached = cache.get(path);
    if (cached) return cached;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const request = Promise.race([
      (async () => {
        const response = await fetcher(root + path.split("/").map(encodeURIComponent).join("/"), {
          signal: controller.signal,
          ...(options.reload ? { cache: "reload" as const } : {}),
        });
        const isFallbackPage =
          /\.(?:json|md)$/i.test(path) && /text\/html/i.test(response.headers.get("content-type") || "");
        if (!response.ok || isFallbackPage)
          throw new Error(`Could not load ${example!.title}/${path}. Please try again.`);
        const content = await response.blob();
        return new File([content], path.split("/").pop()!, {
          type: response.headers.get("content-type") || (path.endsWith(".json") ? "application/json" : "text/markdown"),
        });
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Loading ${example!.title}/${path} timed out. Please try again.`));
          controller.abort();
        }, options.timeoutMs ?? 15000);
      }),
    ])
      .catch((error) => {
        cache.delete(path); // A failed or interrupted request can be retried.
        throw error;
      })
      .finally(() => clearTimeout(timer));
    cache.set(path, request);
    return request;
  }
  const manifestFile = await read(WORKSPACE_MANIFEST);
  let manifest: ReturnType<typeof parseWorkspaceManifest>;
  try {
    manifest = parseWorkspaceManifest(JSON.parse(await manifestFile.text()));
  } catch (error) {
    cache.delete(WORKSPACE_MANIFEST);
    throw error;
  }
  const assets: unknown = manifest.metadata?.assets ?? [];
  if (!Array.isArray(assets)) throw new Error("Example workspace assets must be relative file paths.");
  const assetPaths = assets.map((value: unknown) => {
    if (
      typeof value !== "string" ||
      value.trim() !== value ||
      /[\\:?#]/.test(value) ||
      resolveWorkspacePath(value) !== value
    ) {
      throw new Error("Example workspace assets must be canonical relative file paths.");
    }
    return value;
  });
  const files = new Map<string, WorkspaceFile>([
    [WORKSPACE_MANIFEST, { path: WORKSPACE_MANIFEST, handle: null, file: manifestFile }],
  ]);
  for (const path of new Set([...manifest.graphs, ...assetPaths])) {
    if (path !== WORKSPACE_MANIFEST) files.set(path, { path, handle: null, loadFile: () => read(path) });
  }
  // A rolling pool avoids waiting for the slowest request in each fixed batch.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, manifest.graphs.length) }, async () => {
      while (next < manifest.graphs.length) {
        const path = manifest.graphs[next++];
        files.get(path)!.file = await read(path);
      }
    }),
  );
  return { name: example.title, handle: null, files, exampleId: id };
}
