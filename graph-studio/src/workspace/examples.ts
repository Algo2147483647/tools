import { parseWorkspaceManifest, WORKSPACE_MANIFEST } from "./discovery";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";

export const EXAMPLE_WORKSPACES = [
  {
    id: "graph-studio",
    title: "Graph Studio workflow",
    kind: "Nested node-link",
    description:
      "Follow a graph from opening and editing through appearance, layout, canvas interaction and export. Inspect the full Appearance pipeline, AI commands and live layouts inside their owning processes.",
    detail: "2 nested graphs · Core workflow & Appearance pipeline",
    accent: "#526ea5",
  },
  {
    id: "spatial-atlas",
    title: "Spatial Atlas",
    kind: "Spatial",
    description: "全天星图、全球首都与一级行政区首府及主要城市、北京地铁全线网；城市点大小与明暗展示经济规模。",
    detail: "All-sky stars · 8,097 world cities · Beijing & Shanghai metro",
    accent: "#497fa5",
  },
  {
    id: "china-history",
    title: "Human History",
    kind: "Timeline",
    description: "中国历史与欧洲历史两张独立画布，观察政权分合、制度、文化与社会变迁，附导读和来源。",
    detail: "2 timelines · 1871 events & periods · 2995 relationships · c. 1900 BCE–2026",
    accent: "#a36c43",
  },
  {
    id: "commerce",
    title: "Commerce operations",
    kind: "Nested node-link",
    description:
      "Explore checkout, payments, warehouse, delivery and returns. Expand domain boundaries and trace their original relationships.",
    detail: "46 nodes · 14 parents · 3 journeys",
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
    title: "History of Technology",
    kind: "Timeline",
    description:
      "Explore three timelines: spaceflight, mathematics and physics, and AGI research. Follow discoveries, research programs, debates and their connections.",
    detail: "3 timelines · 804 events & phases · 1209 relationships · c. 1850 BCE–2026",
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
  return id === "europe-history" || EXAMPLE_WORKSPACES.some((example) => example.id === id);
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
  const legacyEurope = id === "europe-history";
  if (legacyEurope) id = "china-history";
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
  let manifestFile = await read(WORKSPACE_MANIFEST);
  let manifest: ReturnType<typeof parseWorkspaceManifest>;
  try {
    manifest = parseWorkspaceManifest(JSON.parse(await manifestFile.text()));
    if (legacyEurope) {
      manifest = { ...manifest, defaultGraph: "europe/europe-history.json" };
      manifestFile = new File([JSON.stringify(manifest)], WORKSPACE_MANIFEST, { type: "application/json" });
    }
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
  // Newly linked style files need not be predeclared in the example's asset list.
  for (const graphPath of manifest.graphs) {
    try {
      const graph = JSON.parse(await files.get(graphPath)!.file!.text());
      for (const reference of [graph.metadata?.style, graph.metadata?.layout]) {
        if (typeof reference !== "string" || /[?#]/.test(reference)) continue;
        const path = resolveWorkspacePath(reference, graphPath);
        if (/\.json$/i.test(path) && !files.has(path))
          files.set(path, { path, handle: null, loadFile: () => read(path) });
      }
    } catch {
      /* Graph and linked-style errors are reported when that graph is opened. */
    }
  }
  return { name: example.title, handle: null, files, exampleId: id };
}

export function invalidateExampleWorkspace(id: string, baseUrl: string) {
  downloads.get(fetch)?.delete(`${baseUrl}examples/${id}/`);
}
