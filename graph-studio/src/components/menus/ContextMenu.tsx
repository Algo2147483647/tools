import { useMemo } from "react";
import { getNodeTitle } from "../../graph/accessors";
import { indexHierarchy } from "../../graph/compound/hierarchy";
import type { CompoundView, GraphChartType, NormalizedDag } from "../../graph/types";
import type { GraphContextMenu, GraphContextTarget } from "../../app/ui/contextMenu";
import type { ContextMenuAction } from "../../app/document/nodeActions";
import ContextMenuIcon from "./ContextMenuIcon";
import { getContextMenuPages, type MenuPage } from "./contextMenuModel";
import { useContextMenuNavigation } from "./useContextMenuNavigation";

interface ContextMenuProps {
  menu: GraphContextMenu | null;
  dag: NormalizedDag | null;
  chartType: GraphChartType;
  view: CompoundView;
  onAction: (action: ContextMenuAction, target: GraphContextTarget) => void;
  onClose: () => void;
}

export default function ContextMenu(props: ContextMenuProps) {
  if (!props.menu || !props.dag) return null;
  return <MenuContent key={JSON.stringify(props.menu)} {...props} menu={props.menu} dag={props.dag} />;
}

function MenuContent({
  menu,
  dag,
  chartType,
  view,
  onAction,
  onClose,
}: ContextMenuProps & { menu: GraphContextMenu; dag: NormalizedDag }) {
  const { pageId, setPageId, inline, rootRef, childRef, hoverTimer, clearHover, openPage, closePage, handleKeyDown } =
    useContextMenuNavigation(menu, onClose);
  const pages = getContextMenuPages(menu.target, dag, chartType, view);
  const page = pageId ? pages[pageId] : null;
  const id = menu.target.kind === "canvas" ? menu.target.parentId : menu.target.id;
  const title = id ? getNodeTitle(dag.nodes[id]) || id : "All nodes";
  const hierarchy = useMemo(() => (chartType === "compound" ? indexHierarchy(dag) : null), [dag, chartType]);
  const parent = menu.target.kind === "canvas" ? menu.target.parentId : hierarchy?.parent.get(menu.target.id);
  const scopeLabel = parent ? getNodeTitle(dag.nodes[parent]) || parent : "Top level";
  const detail =
    menu.target.kind === "group"
      ? `${hierarchy?.leafCount.get(menu.target.id) ?? 0} nodes · ${hierarchy?.children.get(menu.target.id)?.length ?? 0} direct members`
      : menu.target.kind === "node"
        ? hierarchy
          ? `In ${scopeLabel}`
          : id
        : id
          ? "Add or organize members here"
          : `${Object.keys(dag.nodes).length} nodes`;

  function sections(content: MenuPage, child = false) {
    return content.sections.map((section, index) => (
      <div key={index} role="group" className="context-menu-section">
        {section.map((item) => {
          const expanded = Boolean(item.page && item.page === pageId);
          const icon =
            item.action === "group-toggle"
              ? view.collapsedGroupIds.includes(id!)
                ? "expand"
                : "collapse"
              : (item.action ?? item.page!);
          return (
            <button
              key={item.action ?? item.page}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`context-menu-item${item.danger ? " context-menu-item-danger" : ""}${expanded ? " is-expanded" : ""}`}
              disabled={item.disabled}
              title={item.disabledReason}
              data-label={item.label}
              data-page={item.page}
              data-action={item.action}
              aria-label={item.label}
              aria-describedby={
                item.description || item.disabledReason ? `context-description-${item.action}` : undefined
              }
              aria-haspopup={item.page ? "menu" : undefined}
              aria-expanded={item.page ? expanded : undefined}
              aria-controls={expanded ? "context-submenu" : undefined}
              onPointerEnter={(event) => {
                if (child || event.pointerType !== "mouse") return;
                clearHover();
                const trigger = event.currentTarget;
                hoverTimer.current = setTimeout(
                  () => (item.page ? openPage(item.page, trigger, false) : setPageId(null)),
                  180,
                );
              }}
              onPointerLeave={clearHover}
              onFocus={() => {
                if (!child && item.page !== pageId) {
                  clearHover();
                  setPageId(null);
                }
              }}
              onClick={(event) =>
                item.page ? openPage(item.page, event.currentTarget, true) : onAction(item.action!, menu.target)
              }
            >
              <ContextMenuIcon name={icon} />
              <span className="context-menu-copy">
                <span>{item.label}</span>
                {(item.disabledReason || item.description) && (
                  <small id={`context-description-${item.action}`}>{item.disabledReason ?? item.description}</small>
                )}
              </span>
              {item.page && <ContextMenuIcon name="chevron" />}
            </button>
          );
        })}
      </div>
    ));
  }

  return (
    <div
      className="context-menu-layer"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        id="node-context-menu"
        className={`node-context-menu${page && inline ? " is-obscured" : ""}`}
        ref={rootRef}
        role="menu"
        aria-label={`${pages.root.label}: ${title}`}
        aria-hidden={Boolean(page && inline) || undefined}
        style={{ left: menu.x, top: menu.y }}
        onKeyDown={(event) => handleKeyDown(event, false)}
        onScroll={() => {
          clearHover();
          setPageId(null);
        }}
      >
        <div className={`context-menu-heading context-menu-heading-${menu.target.kind}`}>
          <span className="context-menu-target-icon">
            <ContextMenuIcon name={menu.target.kind} />
          </span>
          <div>
            <span className="context-menu-kind">{pages.root.label}</span>
            <strong title={title}>{title}</strong>
            <small title={detail ?? undefined}>{detail}</small>
          </div>
        </div>
        {sections(pages.root)}
        <div className="context-menu-footer" aria-hidden="true">
          <span>
            <kbd>↑↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Select
          </span>
          <span>
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
      {page && (
        <div
          id="context-submenu"
          ref={childRef}
          className={`node-context-menu context-menu-submenu${inline ? " is-inline" : ""}`}
          role="menu"
          aria-label={`${page.label}: ${title}`}
          onPointerEnter={clearHover}
          onKeyDown={(event) => handleKeyDown(event, true)}
        >
          {inline && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="context-menu-item context-menu-back"
              onClick={closePage}
            >
              <ContextMenuIcon name="back" />
              <span>Back to {pages.root.label.toLowerCase()}</span>
            </button>
          )}
          <div className="context-submenu-heading">
            <strong>{page.label}</strong>
            <small title={title}>{title}</small>
          </div>
          {sections(page, true)}
          <div className="context-menu-footer" aria-hidden="true">
            <span>
              <kbd>←</kbd> Back
            </span>
            <span>
              <kbd>↵</kbd> Select
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
