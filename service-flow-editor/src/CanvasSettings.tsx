import { useEffect, useRef, useState } from 'react';
import { defaultNodeAppearance, type CanvasSettings as Settings, type NodeAppearance } from './model';
import Icon from './Icon';

function SettingNumber({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = Number(event.target.value);
        if (
          event.target.value &&
          Number.isFinite(next) &&
          next >= min &&
          next <= max &&
          Math.abs(next / step - Math.round(next / step)) < 0.000001
        )
          onChange(next);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export default function CanvasSettings({
  value,
  onChange,
  appearance,
  onAppearanceChange,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  appearance: NodeAppearance;
  onAppearanceChange: (value: NodeAppearance) => void;
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
        // Native color pickers temporarily move focus outside the document.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
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
          <div className="section-label">NODE APPEARANCE</div>
          <p className="field-help">One style for every collapsed node, across all graphs.</p>
          {(['fillColor', 'borderColor'] as const).map((field) => (
            <div className="appearance-color" key={field}>
              <label className="field">
                {field === 'fillColor' ? 'Node fill color' : 'Node border color'}
                <input
                  type="color"
                  value={appearance[field] ?? (field === 'fillColor' ? '#ffffff' : '#b2bed0')}
                  onChange={(event) => onAppearanceChange({ ...appearance, [field]: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="text-button"
                disabled={!appearance[field]}
                onClick={() => onAppearanceChange({ ...appearance, [field]: undefined })}
                aria-label={field === 'fillColor' ? 'Use theme fill color' : 'Use theme border color'}
              >
                {appearance[field] ? 'Use theme' : 'Theme color'}
              </button>
            </div>
          ))}
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={appearance.borderEnabled}
              onChange={(event) => onAppearanceChange({ ...appearance, borderEnabled: event.target.checked })}
            />
            Show node borders
          </label>
          <label className="field">
            Node border width (px)
            <SettingNumber
              min={0}
              max={12}
              step={0.1}
              value={appearance.borderWidth}
              onChange={(borderWidth) => onAppearanceChange({ ...appearance, borderWidth })}
            />
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={appearance.shadow}
              onChange={(event) => onAppearanceChange({ ...appearance, shadow: event.target.checked })}
            />
            Show node shadows
          </label>
          <label className="field">
            Corner radius (%)
            <SettingNumber
              min={0}
              max={50}
              value={Math.round(appearance.cornerRadius * 100)}
              onChange={(cornerRadius) =>
                onAppearanceChange({ ...appearance, cornerRadius: cornerRadius / 100 })
              }
            />
          </label>
          <p className="field-help">Percentage of the shorter side. Source / sink nodes remain circular.</p>
          <button className="secondary" onClick={() => onAppearanceChange({ ...defaultNodeAppearance })}>
            Reset node appearance
          </button>
        </div>
      )}
    </div>
  );
}
