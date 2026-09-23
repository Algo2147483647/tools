import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultNodeAppearance,
  type CanvasSettings as Settings,
  type NodeAppearance,
  type ResolvedNodeAppearance,
  type NodeFontFamily,
} from './model';

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
  themePicker,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  appearance: ResolvedNodeAppearance;
  onAppearanceChange: (value: NodeAppearance) => void;
  themePicker?: ReactNode;
}) {
  return (
    <section className="canvas-settings-content" aria-label="Canvas settings" data-canvas-control>
      <h3>Canvas</h3>
      {themePicker}
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
          onChange={(event) => onChange({ ...value, gridStyle: event.target.value as Settings['gridStyle'] })}
        >
          <option value="dots">Dots</option>
          <option value="lines">Lines</option>
        </select>
      </label>
      <div className="section-label">NODE APPEARANCE</div>
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
      {appearance.shadow && (
        <>
          <label className="field">
            Shadow opacity (%)
            <SettingNumber
              min={0}
              max={100}
              value={Math.round(appearance.shadowOpacity * 100)}
              onChange={(shadowOpacity) =>
                onAppearanceChange({ ...appearance, shadowOpacity: shadowOpacity / 100 })
              }
            />
          </label>
          <label className="field">
            Shadow blur (px)
            <SettingNumber
              min={0}
              max={24}
              value={appearance.shadowBlur}
              onChange={(shadowBlur) => onAppearanceChange({ ...appearance, shadowBlur })}
            />
          </label>
          <label className="field">
            Shadow offset (px)
            <SettingNumber
              min={0}
              max={24}
              value={appearance.shadowOffsetY}
              onChange={(shadowOffsetY) => onAppearanceChange({ ...appearance, shadowOffsetY })}
            />
          </label>
        </>
      )}
      <label className="field">
        Corner radius (%)
        <SettingNumber
          min={0}
          max={50}
          value={Math.round(appearance.cornerRadius * 100)}
          onChange={(cornerRadius) => onAppearanceChange({ ...appearance, cornerRadius: cornerRadius / 100 })}
        />
      </label>
      <div className="section-label">NODE TYPOGRAPHY</div>
      <label className="field">
        Node font family
        <select
          value={appearance.fontFamily}
          onChange={(event) =>
            onAppearanceChange({ ...appearance, fontFamily: event.target.value as NodeFontFamily })
          }
        >
          <option value="sans">Sans serif</option>
          <option value="system">System</option>
          <option value="serif">Serif (Georgia)</option>
          <option value="mono">Monospace</option>
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
      <div className="appearance-color">
        <label className="field">
          Node font color
          <input
            type="color"
            value={appearance.fontColor ?? '#172033'}
            onChange={(event) => onAppearanceChange({ ...appearance, fontColor: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="text-button"
          disabled={!appearance.fontColor}
          onClick={() => onAppearanceChange({ ...appearance, fontColor: undefined })}
          aria-label="Use theme font color"
        >
          {appearance.fontColor ? 'Use theme' : 'Theme color'}
        </button>
      </div>
      <label className="field">
        Node font weight
        <select
          value={appearance.fontWeight}
          onChange={(event) => onAppearanceChange({ ...appearance, fontWeight: Number(event.target.value) })}
        >
          <option value={100}>Thin (100)</option>
          <option value={200}>Extra light (200)</option>
          <option value={300}>Light (300)</option>
          <option value={400}>Regular (400)</option>
          <option value={500}>Medium (500)</option>
          <option value={600}>Semibold (600)</option>
          <option value={700}>Bold (700)</option>
          <option value={800}>Extra bold (800)</option>
          <option value={900}>Black (900)</option>
        </select>
      </label>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={appearance.fontItalic}
          onChange={(event) => onAppearanceChange({ ...appearance, fontItalic: event.target.checked })}
        />
        Italic node labels
      </label>
      <label className="field">
        Node line height
        <SettingNumber
          min={1}
          max={2}
          step={0.05}
          value={appearance.lineHeight}
          onChange={(lineHeight) => onAppearanceChange({ ...appearance, lineHeight })}
        />
      </label>
      <button className="secondary" onClick={() => onAppearanceChange({ ...defaultNodeAppearance })}>
        Reset node appearance
      </button>
    </section>
  );
}
