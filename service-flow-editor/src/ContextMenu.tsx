import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';

export type ContextAction = {
  label: string;
  icon: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export default function ContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: ContextAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useLayoutEffect(() => {
    const bounds = ref.current!.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);
  function dismiss() {
    onClose();
    document.querySelector<SVGSVGElement>('.graph-canvas')?.focus();
  }
  return (
    <div
      ref={ref}
      className="canvas-context-menu"
      role="menu"
      aria-label="Canvas actions"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          dismiss();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          className={action.danger ? 'danger-item' : ''}
          disabled={action.disabled}
          onClick={() => {
            dismiss();
            action.run();
          }}
        >
          <Icon name={action.icon} size={16} />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
