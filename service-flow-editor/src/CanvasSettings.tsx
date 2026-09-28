import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import Icon from './Icon';
import type { SettingsSection } from './SettingsPage';
import {
  defaultCanvasSettings,
  defaultNodeAppearance,
  nodeFontFamilies,
  nodeFontLabels,
  nodeFontStack,
  type CanvasSettings as Settings,
  type NodeAppearance,
  type ResolvedNodeAppearance,
  type NodeFontFamily,
} from './model';

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <span>{label}</span>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function SettingNumber({
  label,
  accessibleLabel = label,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  accessibleLabel?: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <SettingRow label={label} description={description}>
      <div className={`settings-number ${disabled ? 'disabled' : ''}`}>
        <input
          aria-label={accessibleLabel}
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = Number(event.target.value);
            if (
              event.target.value &&
              Number.isFinite(next) &&
              next >= min &&
              next <= max &&
              Math.abs((next - min) / step - Math.round((next - min) / step)) < 0.000001
            )
              onChange(next);
          }}
          onBlur={() => setDraft(String(value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {unit && <span aria-hidden="true">{unit}</span>}
      </div>
    </SettingRow>
  );
}

function SettingToggle({
  label,
  accessibleLabel = label,
  description,
  checked,
  onChange,
}: {
  label: string;
  accessibleLabel?: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <label className="settings-row settings-switch-row">
      <span className="settings-row-copy">
        <span>{label}</span>
        <span className="settings-row-description" id={descriptionId}>
          {description}
        </span>
      </span>
      <input
        className="settings-switch"
        type="checkbox"
        aria-label={accessibleLabel}
        aria-describedby={descriptionId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function SettingColor({
  label,
  accessibleLabel = label,
  value,
  fallback,
  themeColor,
  resetLabel,
  onChange,
}: {
  label: string;
  accessibleLabel?: string;
  value?: string;
  fallback: string;
  themeColor: string;
  resetLabel: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <SettingRow label={label}>
      <div className="settings-color-control">
        <label className="settings-color-picker" title={`Choose ${label.toLowerCase()}`}>
          <span className="settings-color-swatch" style={{ background: value ?? themeColor }} />
          <span>{value?.toUpperCase() ?? 'Theme'}</span>
          <input
            type="color"
            aria-label={accessibleLabel}
            value={value ?? fallback}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <button
          className="icon-button"
          type="button"
          aria-label={resetLabel}
          title={value ? resetLabel : 'Following the color theme'}
          disabled={!value}
          onClick={() => onChange(undefined)}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>
    </SettingRow>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <div className="settings-group-heading">
        <div>
          <h4>{title}</h4>
          {description && <p>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingsPreview({
  value,
  appearance,
  section,
}: {
  value: Settings;
  appearance: ResolvedNodeAppearance;
  section: SettingsSection;
}) {
  const nodeStyle: CSSProperties = {
    background: appearance.fillColor ?? 'var(--surface)',
    borderColor: appearance.borderColor ?? 'var(--node-border)',
    borderWidth: appearance.borderEnabled ? appearance.borderWidth : 0,
    borderRadius: 84 * appearance.cornerRadius,
    boxShadow: appearance.shadow
      ? `0 ${appearance.shadowOffsetY}px ${appearance.shadowBlur * 2}px rgb(0 0 0 / ${appearance.shadowOpacity})`
      : 'none',
    fontFamily: nodeFontStack(appearance),
    fontWeight: appearance.fontWeight,
    fontSize: value.nodeFontSize,
    fontStyle: appearance.fontItalic ? 'italic' : 'normal',
    lineHeight: appearance.lineHeight,
    color: appearance.fontColor ?? 'var(--text)',
  };
  return (
    <aside className="settings-preview" aria-label="Live appearance preview">
      <div className="settings-preview-heading">
        <span className="preview-live-dot" />
        Live preview
      </div>
      <div
        className={`settings-preview-canvas pattern-${value.gridStyle}`}
        style={{ '--preview-grid-size': `${value.gridSize}px` } as CSSProperties}
      >
        <span className="preview-endpoint">API</span>
        <span className="preview-connector" aria-hidden="true" />
        <div
          className={`preview-service ${section === 'typography' ? 'font-preview' : ''}`}
          style={nodeStyle}
        >
          Orders{section === 'typography' && <span>服务名称</span>}
        </div>
        <span className="preview-connector" aria-hidden="true" />
        <div
          className="preview-container"
          style={{
            borderColor: appearance.expandedBorderColor ?? 'var(--node-border)',
            borderWidth: appearance.expandedBorderWidth,
          }}
        >
          <span>Fulfillment</span>
          <div>
            <span>Stock</span>
            <span>Ship</span>
          </div>
        </div>
      </div>
      <div className="settings-preview-caption">
        <strong>
          {section === 'canvas'
            ? `${value.gridStyle === 'none' ? 'Blank canvas' : `${value.gridSize} px · ${value.gridStyle === 'dots' ? 'Dot grid' : 'Line grid'}`}`
            : section === 'nodes'
              ? 'Your graph, your style'
              : `${nodeFontLabels[appearance.fontFamily]} · ${value.nodeFontSize} px`}
        </strong>
        <p>
          {section === 'canvas'
            ? 'Theme and grid changes appear instantly.'
            : section === 'nodes'
              ? 'Preview a service and an expanded container.'
              : 'Individual node font sizes still take priority.'}
        </p>
      </div>
    </aside>
  );
}

const sectionCopy = {
  canvas: {
    kicker: 'YOUR WORKSPACE',
    title: 'Canvas & workspace',
    description: 'Choose your color theme, grid and alignment preferences.',
  },
  nodes: {
    kicker: 'THE BUILDING BLOCKS',
    title: 'Node appearance',
    description: 'Fine-tune how services and containers look across your graphs.',
  },
  typography: {
    kicker: 'EVERY LABEL MATTERS',
    title: 'Typography',
    description: 'Set the default font, style and spacing for service labels.',
  },
};

export default function CanvasSettings({
  value,
  onChange,
  appearance,
  onAppearanceChange,
  themePicker,
  section = 'canvas',
}: {
  value: Settings;
  onChange: (value: Settings, appearance?: NodeAppearance) => void;
  appearance: ResolvedNodeAppearance;
  onAppearanceChange: (value: NodeAppearance) => void;
  themePicker?: ReactNode;
  section?: SettingsSection;
}) {
  const updateAppearance = (patch: Partial<NodeAppearance>) =>
    onAppearanceChange({ ...appearance, ...patch });
  function resetSection() {
    if (section === 'canvas')
      onChange({
        ...value,
        gridSize: defaultCanvasSettings.gridSize,
        gridStyle: defaultCanvasSettings.gridStyle,
        snapToGrid: defaultCanvasSettings.snapToGrid,
      });
    else if (section === 'typography') {
      onChange(
        { ...value, nodeFontSize: defaultCanvasSettings.nodeFontSize },
        {
          ...appearance,
          fontFamily: defaultNodeAppearance.fontFamily,
          customFontFamily: undefined,
          fontColor: undefined,
          fontWeight: defaultNodeAppearance.fontWeight,
          fontItalic: defaultNodeAppearance.fontItalic,
          lineHeight: defaultNodeAppearance.lineHeight,
        },
      );
    } else
      updateAppearance({
        fillColor: undefined,
        borderColor: undefined,
        borderEnabled: defaultNodeAppearance.borderEnabled,
        borderWidth: defaultNodeAppearance.borderWidth,
        cornerRadius: defaultNodeAppearance.cornerRadius,
        shadow: defaultNodeAppearance.shadow,
        shadowOpacity: defaultNodeAppearance.shadowOpacity,
        shadowBlur: defaultNodeAppearance.shadowBlur,
        shadowOffsetY: defaultNodeAppearance.shadowOffsetY,
        expandedBorderColor: undefined,
        expandedBorderWidth: defaultNodeAppearance.expandedBorderWidth,
      });
  }
  const copy = sectionCopy[section];
  return (
    <section
      className="canvas-settings-content"
      aria-label={`${section === 'canvas' ? 'Canvas' : section === 'nodes' ? 'Node' : 'Typography'} settings`}
      data-canvas-control
    >
      <div className="settings-section-heading">
        <span className="settings-kicker">{copy.kicker}</span>
        <h3>{copy.title}</h3>
        <p>{copy.description}</p>
      </div>
      <div className="settings-editor-layout">
        <div className="settings-form">
          {section === 'canvas' && (
            <>
              {themePicker}
              <SettingsGroup title="Grid & alignment" description="Keep your graph organized as it grows.">
                <SettingRow label="Grid pattern">
                  <select
                    aria-label="Grid pattern"
                    value={value.gridStyle}
                    onChange={(event) =>
                      onChange({ ...value, gridStyle: event.target.value as Settings['gridStyle'] })
                    }
                  >
                    <option value="dots">Dots</option>
                    <option value="lines">Lines</option>
                    <option value="none">Blank</option>
                  </select>
                </SettingRow>
                <SettingNumber
                  label="Grid spacing"
                  accessibleLabel="Grid size (px)"
                  description="Between 8 and 128 pixels."
                  unit="px"
                  min={8}
                  max={128}
                  value={value.gridSize}
                  onChange={(gridSize) => onChange({ ...value, gridSize })}
                />
                <SettingToggle
                  label="Snap to grid"
                  description="Keep moves and resizing aligned."
                  checked={value.snapToGrid}
                  onChange={(snapToGrid) => onChange({ ...value, snapToGrid })}
                />
              </SettingsGroup>
            </>
          )}
          {section === 'nodes' && (
            <>
              <SettingsGroup title="Fill & shape" description="The appearance of collapsed services.">
                <SettingColor
                  label="Fill color"
                  accessibleLabel="Node fill color"
                  value={appearance.fillColor}
                  fallback="#ffffff"
                  themeColor="var(--surface)"
                  resetLabel="Use theme fill color"
                  onChange={(fillColor) => updateAppearance({ fillColor })}
                />
                <SettingNumber
                  label="Corner radius"
                  accessibleLabel="Corner radius (%)"
                  description="From square to fully rounded."
                  unit="%"
                  min={0}
                  max={50}
                  value={Math.round(appearance.cornerRadius * 100)}
                  onChange={(cornerRadius) => updateAppearance({ cornerRadius: cornerRadius / 100 })}
                />
              </SettingsGroup>
              <SettingsGroup title="Border">
                <SettingToggle
                  label="Show borders"
                  accessibleLabel="Show node borders"
                  description="Define the edges of each service."
                  checked={appearance.borderEnabled}
                  onChange={(borderEnabled) => updateAppearance({ borderEnabled })}
                />
                <SettingColor
                  label="Border color"
                  accessibleLabel="Node border color"
                  value={appearance.borderColor}
                  fallback="#b2bed0"
                  themeColor="var(--node-border)"
                  resetLabel="Use theme border color"
                  onChange={(borderColor) => updateAppearance({ borderColor })}
                />
                <SettingNumber
                  label="Border width"
                  accessibleLabel="Node border width (px)"
                  unit="px"
                  min={0}
                  max={12}
                  step={0.1}
                  disabled={!appearance.borderEnabled}
                  value={appearance.borderWidth}
                  onChange={(borderWidth) => updateAppearance({ borderWidth })}
                />
              </SettingsGroup>
              <SettingsGroup title="Shadow">
                <SettingToggle
                  label="Show shadows"
                  accessibleLabel="Show node shadows"
                  description="Lift services off the canvas."
                  checked={appearance.shadow}
                  onChange={(shadow) => updateAppearance({ shadow })}
                />
                {appearance.shadow && (
                  <>
                    <SettingNumber
                      label="Opacity"
                      accessibleLabel="Shadow opacity (%)"
                      unit="%"
                      min={0}
                      max={100}
                      value={Math.round(appearance.shadowOpacity * 100)}
                      onChange={(shadowOpacity) => updateAppearance({ shadowOpacity: shadowOpacity / 100 })}
                    />
                    <SettingNumber
                      label="Blur"
                      accessibleLabel="Shadow blur (px)"
                      unit="px"
                      min={0}
                      max={24}
                      value={appearance.shadowBlur}
                      onChange={(shadowBlur) => updateAppearance({ shadowBlur })}
                    />
                    <SettingNumber
                      label="Vertical offset"
                      accessibleLabel="Shadow offset (px)"
                      unit="px"
                      min={0}
                      max={24}
                      value={appearance.shadowOffsetY}
                      onChange={(shadowOffsetY) => updateAppearance({ shadowOffsetY })}
                    />
                  </>
                )}
              </SettingsGroup>
              <SettingsGroup title="Expanded containers" description="Outlines around nested service groups.">
                <SettingColor
                  label="Border color"
                  accessibleLabel="Expanded border color"
                  value={appearance.expandedBorderColor}
                  fallback="#b2bed0"
                  themeColor="var(--node-border)"
                  resetLabel="Use theme expanded border color"
                  onChange={(expandedBorderColor) => updateAppearance({ expandedBorderColor })}
                />
                <SettingNumber
                  label="Border width"
                  accessibleLabel="Expanded border width (px)"
                  unit="px"
                  min={0}
                  max={12}
                  step={0.1}
                  value={appearance.expandedBorderWidth}
                  onChange={(expandedBorderWidth) => updateAppearance({ expandedBorderWidth })}
                />
              </SettingsGroup>
            </>
          )}
          {section === 'typography' && (
            <>
              <SettingsGroup title="Font" description="A shared type style for your service labels.">
                <SettingRow label="Font family">
                  <select
                    aria-label="Node font family"
                    value={appearance.fontFamily}
                    onChange={(event) =>
                      updateAppearance({ fontFamily: event.target.value as NodeFontFamily })
                    }
                  >
                    {(Object.keys(nodeFontFamilies) as NodeFontFamily[]).map((family) => (
                      <option key={family} value={family} style={{ fontFamily: nodeFontFamilies[family] }}>
                        {nodeFontLabels[family]}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                {appearance.fontFamily === 'custom' && (
                  <SettingRow label="Custom font" description="Use a font installed on this device.">
                    <input
                      aria-label="Custom font family"
                      value={appearance.customFontFamily ?? ''}
                      maxLength={120}
                      placeholder="Installed font name"
                      onChange={(event) => updateAppearance({ customFontFamily: event.target.value })}
                    />
                  </SettingRow>
                )}
                <SettingNumber
                  label="Font size"
                  accessibleLabel="Default node font size (px)"
                  unit="px"
                  min={12}
                  max={48}
                  value={value.nodeFontSize}
                  onChange={(nodeFontSize) => onChange({ ...value, nodeFontSize })}
                />
                <SettingColor
                  label="Text color"
                  accessibleLabel="Node font color"
                  value={appearance.fontColor}
                  fallback="#172033"
                  themeColor="var(--text)"
                  resetLabel="Use theme font color"
                  onChange={(fontColor) => updateAppearance({ fontColor })}
                />
              </SettingsGroup>
              <SettingsGroup title="Style & spacing">
                <SettingRow label="Font weight">
                  <select
                    aria-label="Node font weight"
                    value={appearance.fontWeight}
                    onChange={(event) => updateAppearance({ fontWeight: Number(event.target.value) })}
                  >
                    {[
                      'Thin',
                      'Extra light',
                      'Light',
                      'Regular',
                      'Medium',
                      'Semibold',
                      'Bold',
                      'Extra bold',
                      'Black',
                    ].map((label, index) => (
                      <option key={label} value={(index + 1) * 100}>
                        {label} ({(index + 1) * 100})
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingToggle
                  label="Italic labels"
                  accessibleLabel="Italic node labels"
                  description="Add a slant to service names."
                  checked={appearance.fontItalic}
                  onChange={(fontItalic) => updateAppearance({ fontItalic })}
                />
                <SettingNumber
                  label="Line height"
                  accessibleLabel="Node line height"
                  description="Space between lines of text."
                  unit="×"
                  min={1}
                  max={2}
                  step={0.05}
                  value={appearance.lineHeight}
                  onChange={(lineHeight) => updateAppearance({ lineHeight })}
                />
              </SettingsGroup>
            </>
          )}
          <div className="settings-reset">
            <button type="button" onClick={resetSection}>
              <Icon name="refresh" size={14} />
              {section === 'canvas'
                ? 'Reset grid settings'
                : section === 'nodes'
                  ? 'Reset node appearance'
                  : 'Reset typography'}
            </button>
            <span>Restore defaults for this section.</span>
          </div>
        </div>
        <SettingsPreview value={value} appearance={appearance} section={section} />
      </div>
    </section>
  );
}
