import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { TimelineControlsProps } from "../timeline/TimelineControls";
import { resolveUIPath, type AppearanceUINode } from "./appearanceUIConfig";
import type { AppearanceBinding, AppearanceUIModel } from "./appearanceUIModel";

export interface AppearanceRendererProps {
  node: AppearanceUINode;
  binding?: AppearanceBinding;
  children: ReactNode;
}
export interface AppearanceUIContextValue {
  model: AppearanceUIModel;
  registry: Record<string, ComponentType<AppearanceRendererProps>>;
  commit: (change: () => ReturnType<AppearanceUIModel["change"]>) => void;
  query: string;
  timelineControls?: TimelineControlsProps;
}
export const AppearanceUIContext = createContext<AppearanceUIContextValue | null>(null);
export function useAppearanceUI() {
  const context = useContext(AppearanceUIContext);
  if (!context) throw new Error("Appearance controls require the Schema UI provider.");
  return context;
}

/** A registered parent owns its layout; descendants can select more specific renderers. */
export function AppearanceUIOutlet({ node, parentPath }: { node: AppearanceUINode; parentPath?: string }) {
  const { model, registry, query } = useAppearanceUI();
  const visible = (item: AppearanceUINode, parent?: string): boolean => {
    if (item.charts && !item.charts.includes(model.chart)) return false;
    const itemPath = resolveUIPath(parent, item.path);
    const entry = itemPath ? model.bind(itemPath) : undefined;
    if (entry && (!entry.supported || !entry.visible)) return false;
    if (item.children) return item.children.some((child) => visible(child, itemPath));
    return (
      !query ||
      `${item.label ?? ""} ${item.id} ${itemPath ?? ""} ${entry?.definition.label ?? ""} ${entry?.definition.description ?? ""} ${entry?.definition.keywords ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  };
  if (node.renderer === "section" && !visible(node, parentPath)) return null;
  if (node.charts && !node.charts.includes(model.chart)) return null;
  const path = resolveUIPath(parentPath, node.path);
  const binding = path ? model.bind(path) : undefined;
  if (binding && (!binding.supported || !binding.visible)) return null;
  if (
    query &&
    !node.children &&
    !`${node.label ?? ""} ${node.id} ${path ?? ""} ${binding?.definition.label ?? ""} ${binding?.definition.description ?? ""} ${binding?.definition.keywords ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )
    return null;
  const renderer =
    node.renderer ??
    (node.children
      ? "panel"
      : binding?.definition.kind === "boolean"
        ? "toggle"
        : binding?.definition.format === "color"
          ? "color"
          : binding?.definition.kind === "number" || binding?.definition.format === "pixels"
            ? "number"
            : "field");
  const Component = registry[renderer];
  if (!Component) throw new Error(`Unknown Appearance UI renderer: ${renderer}`);
  const children = node.children?.map((child) => <AppearanceUIOutlet key={child.id} node={child} parentPath={path} />);
  return (
    <Component node={node} binding={binding}>
      {children}
    </Component>
  );
}
