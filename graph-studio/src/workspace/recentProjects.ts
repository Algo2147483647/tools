import type { RecentLocation } from "../workspace/locations";

export interface RecentProject {
  location: RecentLocation;
  recordIds: string[];
}

// Without a handle, identical locations are the same "choose again" action.
// Group that action for display; keep distinct, reopenable folders separate.
export function recentProjects(locations: RecentLocation[]): RecentProject[] {
  const projects: RecentProject[] = [];
  const reconnect = new Map<string, RecentProject>();
  const available = new Map<string, RecentProject[]>();
  const sorted = [...locations].sort((a, b) => b.openedAt - a.openedAt);
  const keyOf = (location: RecentLocation) => JSON.stringify([location.kind, location.location]);
  for (const location of sorted.filter((item) => item.handle || item.exampleId)) {
    const project = { location, recordIds: [location.id] };
    projects.push(project);
    if (location.handle && !location.exampleId) {
      const key = keyOf(location);
      available.set(key, [...(available.get(key) || []), project]);
    }
  }
  for (const location of sorted.filter((item) => !item.handle && !item.exampleId)) {
    const key = keyOf(location);
    const live = available.get(key);
    const previous = live?.length === 1 ? live[0] : reconnect.get(key);
    if (previous) {
      previous.recordIds.push(location.id);
      if (!previous.location.handle && !previous.location.lastGraph && location.lastGraph)
        previous.location = { ...previous.location, lastGraph: location.lastGraph };
      continue;
    }
    const project = { location, recordIds: [location.id] };
    projects.push(project);
    reconnect.set(key, project);
  }
  return projects.sort((a, b) => b.location.openedAt - a.location.openedAt);
}
