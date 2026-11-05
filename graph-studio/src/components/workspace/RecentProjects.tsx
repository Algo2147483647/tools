import Icon from "../ui/Icon";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import { recentProjects, type RecentProject } from "../../workspace/recentProjects";

const PROJECT_COLORS = [
  { backgroundColor: "#e0ebff", color: "#4269b0" },
  { backgroundColor: "#eee3ff", color: "#8055ad" },
  { backgroundColor: "#d9f5e9", color: "#287d65" },
  { backgroundColor: "#ffedcf", color: "#996522" },
  { backgroundColor: "#ffe2ed", color: "#aa5278" },
  { backgroundColor: "#d9f2ff", color: "#377c9e" },
];

function projectColor(name: string) {
  let hash = 0;
  for (const character of name) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function groupRecentProjects(recents: RecentProject[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map<string, { label: string; items: RecentProject[] }>();

  for (const item of recents) {
    const date = new Date(item.location.openedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const day = date.toDateString();
    let group = groups.get(day);
    if (!group) {
      const label =
        day === today.toDateString()
          ? "Today"
          : day === yesterday.toDateString()
            ? "Yesterday"
            : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
      group = { label, items: [] };
      groups.set(day, group);
    }
    group.items.push(item);
  }
  return [...groups.entries()];
}

export default function RecentProjects({ files }: { files: WorkspaceControls }) {
  const groups = groupRecentProjects(recentProjects(files.recents));
  return (
    <section className="welcome-recents" aria-labelledby="recent-projects-title">
      <div className="welcome-section-heading">
        <h1 id="recent-projects-title">
          <Icon name="recent" size={18} />
          Recent projects
        </h1>
      </div>
      {groups.length ? (
        <div className="recent-timeline" role="region" aria-label="Recent projects timeline" tabIndex={0}>
          {groups.map(([day, group]) => (
            <section className="recent-day" key={day} aria-label={group.label}>
              <h2 className="recent-day-label">{group.label}</h2>
              <ol className="recent-list">
                {group.items.map(({ location: item, recordIds }) => {
                  const location = item.lastGraph || (item.location !== item.name ? item.location : "");
                  return (
                    <li key={item.id}>
                      <button className="recent-open" disabled={files.busy} onClick={() => files.openRecent(item)}>
                        <span className="recent-icon" style={projectColor(item.name)} aria-hidden="true">
                          {Array.from(item.name.trim())[0]?.toLocaleUpperCase("en") || "?"}
                        </span>
                        <span className="recent-description">
                          <strong title={item.name}>{item.name}</strong>
                          {location && <small title={location}>{location}</small>}
                          {!item.canReopen && (
                            <span className="recent-reconnect">
                              Choose {item.kind === "workspace" ? "folder" : "file"} again
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        className="recent-remove"
                        disabled={files.busy}
                        title={`Remove ${item.name} from recent projects`}
                        aria-label={`Remove ${item.name} from recent projects`}
                        onClick={() => void files.removeRecent(recordIds)}
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="recent-empty">
          <Icon name="recent" size={28} />
          <div>
            <strong>No recent projects yet</strong>
            <p>Opened workspaces and graph files will appear here.</p>
          </div>
        </div>
      )}
    </section>
  );
}
