import { parseWorkspaceManifest, WORKSPACE_MANIFEST } from "./discovery";
import type { WorkspaceFolder } from "./types";

export const EXAMPLE_WORKSPACES = [
  { id: "mathematics", title: "Mathematics", kind: "Knowledge graph", description: "From sets to geometry, analysis, and probability. Explore connected concepts and their linked notes.", detail: "112 concepts · 8 subjects", accent: "#5576a9" },
  { id: "factorio", title: "Factorio production", kind: "Sankey diagrams", description: "Follow ingredients through production. Browse the complete recipe atlas and focused manufacturing views.", detail: "Base game + Space Age · 2.0.65", accent: "#a57540" },
  { id: "energy", title: "Energy flows", kind: "Sankey essentials", description: "A small, balanced flow diagram connecting energy sources, conversion, and everyday use.", detail: "8 nodes · 9 flows", accent: "#4d8b7e" },
] as const;

export function isExampleId(id: unknown): id is string {
  return EXAMPLE_WORKSPACES.some(example => example.id === id);
}

/** Every open creates fresh File objects, with no writable handles to bundled originals. */
export async function loadExampleWorkspace(id: string, baseUrl: string, fetcher: typeof fetch = fetch): Promise<WorkspaceFolder> {
  const example = EXAMPLE_WORKSPACES.find(entry => entry.id === id);
  if (!example) throw new Error("Unknown example workspace.");
  const response = await fetcher(`${baseUrl}examples/${id}.json`);
  if (!response.ok) throw new Error(`Could not load the ${example.title} workspace. Please try again.`);
  const bundle = await response.json();
  if (bundle?.format !== "graph-studio-example" || bundle.version !== 1 || !bundle.files || typeof bundle.files !== "object" || Array.isArray(bundle.files)) {
    throw new Error("Invalid example workspace bundle.");
  }
  const entries = Object.entries(bundle.files).map(([path, text]) => {
    if (typeof text !== "string" || !/^[\w./ -]+$/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid example workspace file.");
    return [path, { path, handle: null, file: new File([text], path.split("/").pop()!, { type: path.endsWith(".json") ? "application/json" : "text/markdown" }) }] as const;
  });
  const manifestText = bundle.files[WORKSPACE_MANIFEST];
  if (typeof manifestText !== "string") throw new Error("Example workspace manifest is missing.");
  parseWorkspaceManifest(JSON.parse(manifestText));
  return { name: example.title, handle: null, files: new Map(entries), exampleId: id };
}
