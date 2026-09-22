import { useEffect, useRef, useState } from 'react';
import type { CanvasSettings as Settings } from './model';
import Icon from './Icon';

function SettingNumber({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = Number(event.target.value);
        if (event.target.value && Number.isInteger(next) && next >= min && next <= max) onChange(next);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export default function CanvasSettings({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="canvas-settings"
      ref={root}
      data-canvas-control
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="secondary"
        aria-label="Canvas settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <Icon name="grid" size={16} />
        <span>Canvas</span>
      </button>
      {open && (
        <div className="canvas-settings-panel" role="dialog" aria-label="Canvas settings">
          <strong>Canvas settings</strong>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={value.snapToGrid}
              onChange={(event) => onChange({ ...value, snapToGrid: event.target.checked })}
            />
            Snap to grid
          </label>
          <label className="field">
            Grid size (px)
            <SettingNumber
              min={8}
              max={128}
              value={value.gridSize}
              onChange={(gridSize) => onChange({ ...value, gridSize })}
            />
          </label>
          <label className="field">
            Grid pattern
            <select
              value={value.gridStyle}
              onChange={(event) =>
                onChange({ ...value, gridStyle: event.target.value as Settings['gridStyle'] })
              }
            >
              <option value="dots">Dots</option>
              <option value="lines">Lines</option>
            </select>
          </label>
          <label className="field">
            Default node font size (px)
            <SettingNumber
              min={12}
              max={48}
              value={value.nodeFontSize}
              onChange={(nodeFontSize) => onChange({ ...value, nodeFontSize })}
            />
          </label>
          <p className="field-help">
            Saved with this workspace, across every graph. Individual nodes can override the default font
            size.
          </p>
        </div>
      )}
    </div>
  );
}
