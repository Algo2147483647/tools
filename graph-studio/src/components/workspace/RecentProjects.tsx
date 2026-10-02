import type { RecentLocation } from "../../adapters/recentImport";
import type { WorkspaceControls } from "../../hooks/useGraphImport";
import WorkspaceIcon from "./WorkspaceIcon";

function groupRecentProjects(recents: RecentLocation[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map<string, { label: string; items: RecentLocation[] }>();

  for (const item of [...recents].sort((a, b) => b.openedAt - a.openedAt)) {
    const date = new Date(item.openedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const day = date.toDateString();
    let group = groups.get(day);
    if (!group) {
      const label = day === today.toDateString() ? "Today"
        : day === yesterday.toDateString() ? "Yesterday"
        : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
      group = { label, items: [] };
      groups.set(day, group);
    }
    group.items.push(item);
  }
  return [...groups.entries()];
}

export default function RecentProjects({ files }: { files: WorkspaceControls }) {
  const groups = groupRecentProjects(files.recents);
  const count = groups.reduce((total, [, group]) => total + group.items.length, 0);
  return <section className="welcome-recents" aria-labelledby="recent-projects-title">
    <div className="welcome-section-heading">
      <h1 id="recent-projects-title"><WorkspaceIcon name="recent"/>Recent projects</h1>
      {count > 0 && <span>{count} {count === 1 ? "project" : "projects"}</span>}
    </div>
    {groups.length ? <div className="recent-timeline" role="region" aria-label="Recent projects timeline" tabIndex={0}>
      {groups.map(([day, group]) => <section className="recent-day" key={day} aria-label={group.label}>
        <h2 className="recent-day-label">{group.label}</h2>
        <ol className="recent-list">
          {group.items.map(item => {
            const opened = new Date(item.openedAt);
            const location = `${item.location}${item.lastGraph ? ` / ${item.lastGraph}` : ""}`;
            const kind = item.exampleId ? "Example workspace" : item.kind === "workspace" ? "Workspace" : "Graph file";
            return <li key={item.id}>
              <button className="recent-open" disabled={files.busy} onClick={() => files.openRecent(item)}>
                <span className="recent-icon"><WorkspaceIcon name={item.kind === "workspace" ? "folder" : "file"} size={18}/></span>
                <span className="recent-description">
                  <strong title={item.name}>{item.name}</strong>
                  <small title={location}>{location}</small>
                  <span className="recent-details">
                    <span>{kind}</span><span aria-hidden="true">·</span>
                    <time dateTime={opened.toISOString()} title={`Last opened ${opened.toLocaleString()}`}>
                      {opened.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                    {!item.canReopen && <span className="recent-reconnect">Choose {item.kind === "workspace" ? "folder" : "file"} again</span>}
                  </span>
                </span>
                <span className="recent-arrow" aria-hidden="true">↗</span>
              </button>
              <button className="recent-remove" disabled={files.busy} title={`Remove ${item.name} from recent projects`} aria-label={`Remove ${item.name} from recent projects`} onClick={() => void files.removeRecent(item.id)}>
                <WorkspaceIcon name="close" size={15}/>
              </button>
            </li>;
          })}
        </ol>
      </section>)}
    </div> : <div className="recent-empty">
      <WorkspaceIcon name="recent" size={28}/>
      <div><strong>No recent projects yet</strong><p>Opened workspaces and graph files will appear here.</p></div>
    </div>}
  </section>;
}
