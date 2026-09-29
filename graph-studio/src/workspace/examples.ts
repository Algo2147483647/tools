import { parseWorkspaceManifest, WORKSPACE_MANIFEST } from "./discovery";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";

export const EXAMPLE_WORKSPACES = [
  { id: "mathematics", title: "Mathematics", kind: "Knowledge graph", description: "From sets to geometry, analysis, and probability. Explore connected concepts and their linked notes.", detail: "112 concepts · 8 subjects", accent: "#5576a9" },
  { id: "factorio", title: "Factorio production", kind: "Sankey diagrams", description: "Work backwards from 1 launch-ready rocket/s or all 12 science packs at 1 each/s. Trace calculated demand to raw resources.", detail: "2 production targets · Space Age 2.0.65", accent: "#a57540" },
  { id: "energy", title: "Energy flows", kind: "Sankey essentials", description: "A small, balanced flow diagram connecting energy sources, conversion, and everyday use.", detail: "8 nodes · 9 flows", accent: "#4d8b7e" },
] as const;

export function isExampleId(id: unknown): id is string {
  return EXAMPLE_WORKSPACES.some(example => example.id === id);
}

/** Load the same manifest and files that can be opened locally as a workspace. */
export async function loadExampleWorkspace(id: string, baseUrl: string, fetcher: typeof fetch = fetch): Promise<WorkspaceFolder> {
  const example = EXAMPLE_WORKSPACES.find(entry => entry.id === id);
  if (!example) throw new Error("Unknown example workspace.");
  const root = `${baseUrl}examples/${id}/`;
  async function read(path: string): Promise<WorkspaceFile> {
    const response = await fetcher(root + path.split("/").map(encodeURIComponent).join("/"));
    const isFallbackPage = /\.(?:json|md)$/i.test(path) && /text\/html/i.test(response.headers.get("content-type") || "");
    if (!response.ok || isFallbackPage) throw new Error(`Could not load ${example!.title}/${path}. Please try again.`);
    const text = await response.text();
    return { path, handle: null, file: new File([text], path.split("/").pop()!, { type: path.endsWith(".json") ? "application/json" : "text/markdown" }) };
  }
  const manifestFile = await read(WORKSPACE_MANIFEST);
  const manifest = parseWorkspaceManifest(JSON.parse(await manifestFile.file!.text()));
  const assets: unknown = manifest.metadata?.assets ?? [];
  if (!Array.isArray(assets)) throw new Error("Example workspace assets must be relative file paths.");
  const assetPaths = assets.map((value: unknown) => {
    if (typeof value !== "string" || value.trim() !== value || /[\\:?#]/.test(value) || resolveWorkspacePath(value) !== value) {
      throw new Error("Example workspace assets must be canonical relative file paths.");
    }
    return value;
  });
  const paths = [...new Set([...manifest.graphs, ...assetPaths])].filter(path => path !== WORKSPACE_MANIFEST);
  const files = new Map<string, WorkspaceFile>([[WORKSPACE_MANIFEST, manifestFile]]);
  // Keep requests bounded, including the larger collection of mathematics notes.
  for (let start = 0; start < paths.length; start += 6) {
    const entries = await Promise.all(paths.slice(start, start + 6).map(read));
    entries.forEach(entry => files.set(entry.path, entry));
  }
  return { name: example.title, handle: null, files, exampleId: id };
}
