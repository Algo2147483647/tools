import type { CSSProperties } from "react";
import type { GraphHierarchy } from "../graph/types";

const domainPalettes = new WeakMap<GraphHierarchy, Map<string, number>>();

/** Use the complete hierarchy so a domain keeps its color after entering a subgraph. */
export function compoundDomainId(id: string, hierarchy?: GraphHierarchy): string {
  let domain = id;
  const visited = new Set<string>();
  while (hierarchy?.parentById[domain] && !visited.has(domain)) {
    visited.add(domain);
    domain = hierarchy.parentById[domain];
  }
  return domain;
}

export function compoundDomainStyle(id: string, hierarchy?: GraphHierarchy): CSSProperties {
  const domain = compoundDomainId(id, hierarchy);
  let hash = 0;
  for (let index = 0; index < domain.length; index++) hash = (hash * 31 + domain.charCodeAt(index)) >>> 0;
  let palette = hierarchy && domainPalettes.get(hierarchy);
  if (hierarchy && !palette) {
    const roots = Object.keys(hierarchy.groups)
      .filter((key) => !hierarchy.parentById[key])
      .sort();
    const hues = [214, 162, 278, 34, 190, 334, 84, 245];
    palette = new Map(
      roots.map((root, index) => [root, (hues[index % hues.length] + Math.floor(index / hues.length) * 17) % 360]),
    );
    domainPalettes.set(hierarchy, palette);
  }
  const hue = palette?.get(domain) ?? hash % 360;
  return {
    "--compound-domain-fill": `hsl(${hue} 58% 93%)`,
    "--compound-domain-stroke": `hsl(${hue} 32% 67%)`,
    "--compound-domain-accent": `hsl(${hue} 48% 40%)`,
  } as CSSProperties;
}

export function isCompoundMember(id: string, groupId: string | null | undefined, hierarchy?: GraphHierarchy): boolean {
  if (!groupId) return false;
  let current: string | undefined = id;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === groupId) return true;
    visited.add(current);
    current = hierarchy?.parentById[current];
  }
  return false;
}

export function compoundGroupEmphasis(id: string, selectedId: string | null | undefined, hierarchy?: GraphHierarchy) {
  if (id === selectedId) return "selected";
  if (selectedId && isCompoundMember(selectedId, id, hierarchy)) return "ancestor";
  return isCompoundMember(id, selectedId, hierarchy) ? "member" : "context";
}
