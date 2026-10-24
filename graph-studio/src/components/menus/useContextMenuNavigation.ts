import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { GraphContextMenu } from "../../app/ui/contextMenu";
import { placeContextMenu, placeContextSubmenu } from "./contextMenuPosition";
const enabledItems = (element: HTMLElement | null) => [
  ...(element?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
];
export function useContextMenuNavigation(menu: GraphContextMenu, onClose: () => void) {
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

  return { pageId, setPageId, inline, rootRef, childRef, hoverTimer, clearHover, openPage, closePage, handleKeyDown };
}
