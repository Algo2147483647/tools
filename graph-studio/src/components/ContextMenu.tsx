import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CompoundView, GraphChartType, NormalizedDag } from "../graph/types";
import { getNodeTitle } from "../graph/accessors";
import { indexHierarchy } from "../graph/hierarchy";
import type { GraphContextMenu, GraphContextTarget } from "../state/contextMenu";
import { getContextMenuPages, type ContextMenuAction, type MenuPage } from "./contextMenuModel";
import { placeContextMenu, placeContextSubmenu } from "./contextMenuPosition";
import ContextMenuIcon from "./ContextMenuIcon";
export type { ContextMenuAction } from "./contextMenuModel";

interface ContextMenuProps {
  menu: GraphContextMenu | null;
  dag: NormalizedDag | null;
  chartType: GraphChartType;
  view: CompoundView;
  onAction: (action: ContextMenuAction, target: GraphContextTarget) => void;
  onClose: () => void;
}

const enabledItems = (element: HTMLElement | null) => [
  ...(element?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
];

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
  const [pageId, setPageId] = useState<string | null>(null);
  const [inline, setInline] = useState(false);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const rootRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const originRef = useRef(document.activeElement);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingFocus = useRef(false);
  const typeahead = useRef({ query: "", time: 0 });
  const pages = getContextMenuPages(menu.target, dag, chartType, view);
  const page = pageId ? pages[pageId] : null;
  const id = menu.target.kind === "canvas" ? menu.target.parentId : menu.target.id;
  const title = id
    ? (menu.target.kind === "node" ? getNodeTitle(dag.nodes[id]) : dag.hierarchy?.groups[id]?.title) || id
    : "All nodes";
  const hierarchy = useMemo(() => (chartType === "compound" ? indexHierarchy(dag) : null), [dag, chartType]);
  const parent = menu.target.kind === "canvas" ? menu.target.parentId : hierarchy?.parent.get(menu.target.id);
  const scopeLabel = parent ? dag.hierarchy?.groups[parent]?.title || parent : "Top level";
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

  const clearHover = () => clearTimeout(hoverTimer.current);
  function restoreOrigin() {
    const origin = originRef.current;
    const target =
      origin === document.body && menu.target.kind !== "canvas"
        ? document.querySelector<SVGElement>(
            `.dag-node[data-key="${CSS.escape(menu.target.id)}"], [data-group-id="${CSS.escape(menu.target.id)}"][tabindex]`,
          )
        : origin;
    if ((target instanceof HTMLElement || target instanceof SVGElement) && target.isConnected)
      target.focus({ preventScroll: true });
  }
  function openPage(next: string, trigger: HTMLButtonElement, focus: boolean) {
    clearHover();
    triggerRef.current = trigger;
    pendingFocus.current = focus;
    if (next === pageId && focus) {
      enabledItems(childRef.current)[inline ? 1 : 0]?.focus();
      pendingFocus.current = false;
    } else setPageId(next);
  }
  function closePage() {
    clearHover();
    setPageId(null);
    pendingFocus.current = false;
    // Restore after the inline page releases visibility on the root menu.
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      clearTimeout(hoverTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    enabledItems(rootRef.current)[0]?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const pos = placeContextMenu(menu, root.getBoundingClientRect(), viewport);
    Object.assign(root.style, { left: `${pos.left}px`, top: `${pos.top}px` });
    const child = childRef.current;
    const trigger = triggerRef.current;
    if (!pageId || !child || !trigger) return;
    const size = child.getBoundingClientRect();
    const placement = placeContextSubmenu(
      root.getBoundingClientRect(),
      trigger.getBoundingClientRect().top,
      size,
      viewport,
    );
    const childPos = placement.inline ? placeContextMenu(menu, size, viewport) : placement;
    Object.assign(child.style, { left: `${childPos.left}px`, top: `${childPos.top}px` });
    child.dataset.side = placement.side;
    root.dataset.submenuSide = placement.inline ? "inline" : placement.side;
    setInline(placement.inline);
    if (pendingFocus.current || (placement.inline && root.contains(document.activeElement))) {
      // Inline pages include a Back item; focus the first action, not Back.
      const firstAction = child.querySelector<HTMLButtonElement>("[data-action]:not(:disabled)");
      firstAction?.focus({ preventScroll: true });
      pendingFocus.current = false;
    }
  }, [menu, pageId, viewport, inline]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, child: boolean) {
    const buttons = enabledItems(event.currentTarget);
    const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      clearHover();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (active + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "ArrowRight" && !child) {
      const trigger = document.activeElement as HTMLButtonElement;
      if (trigger.dataset.page) {
        event.preventDefault();
        event.stopPropagation();
        openPage(trigger.dataset.page, trigger, true);
      }
    } else if ((event.key === "ArrowLeft" && child) || (event.key === "Escape" && pageId)) {
      event.preventDefault();
      event.stopPropagation();
      closePage();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.stopPropagation();
      clearHover();
      if (event.key === "Escape") event.preventDefault();
      restoreOrigin();
      onClose();
    } else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      clearHover();
      const now = Date.now();
      const previous = now - typeahead.current.time < 600 ? typeahead.current.query : "";
      const query = previous + event.key.toLowerCase();
      typeahead.current = { query, time: now };
      const search = [...buttons.slice(active + 1), ...buttons.slice(0, active + 1)];
      const match =
        search.find((button) => button.dataset.label?.toLowerCase().startsWith(query)) ??
        search.find((button) => button.dataset.label?.toLowerCase().startsWith(event.key.toLowerCase()));
      match?.focus();
    }
  }

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
