import { useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Check,
  Columns2,
  FileText,
  Keyboard,
  LayoutPanelLeft,
  Monitor,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Smartphone,
  Undo2,
} from 'lucide-react'
import { usePreferences } from '../preferences'
import { useStudio } from '../store'
import { settingsHref, type SettingsSection } from '../settings-route'
import { TextSetting, Toggle } from './ui'

const sections = [
  {
    id: 'layout',
    title: 'Form layout',
    description: 'Choose how labels and controls work together.',
    Icon: Columns2,
  },
  {
    id: 'details',
    title: 'Form details',
    description: 'Set the words people see before and after they respond.',
    Icon: FileText,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Adjust your glass surfaces, canvas and form color.',
    Icon: Palette,
  },
  {
    id: 'workspace',
    title: 'Workspace',
    description: 'Make room to work and choose your preview size.',
    Icon: LayoutPanelLeft,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    description: 'Keep your hands on the keyboard while you build.',
    Icon: Keyboard,
  },
] as const

export default function SettingsPage({
  section,
  mobile,
  onMobile,
  panelsOpen,
  onPanels,
  onBack,
}: {
  section: SettingsSection
  mobile: boolean
  onMobile: (value: boolean) => void
  panelsOpen: boolean
  onPanels: (show: boolean) => void
  onBack: () => void
}) {
  const { doc, updateDocument, past, future, undo, redo, saveError } = useStudio()
  const preferences = usePreferences()
  const heading = useRef<HTMLHeadingElement>(null)
  const scroll = useRef<HTMLElement>(null)
  const active = sections.find((item) => item.id === section)!
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [section])
  return (
    <main className="settings-screen" aria-label="Settings page">
      <div className="settings-frame">
        <header className="settings-page-header">
          <button className="button settings-return" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to editor
          </button>
          <span className="settings-save">
            <Check size={14} />
            {saveError || preferences.error ? 'Check storage' : 'Saved locally'}
          </span>
        </header>
        <aside className="settings-sidebar glass-surface">
          <h2>Settings</h2>
          <p title={doc.title}>{doc.title}</p>
          <select
            className="settings-mobile-nav"
            aria-label="Settings section"
            value={section}
            onChange={(event) => {
              window.location.hash = settingsHref(event.target.value as SettingsSection)
            }}
          >
            {sections.map(({ id, title }) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <nav aria-label="Settings sections">
            {sections.map(({ id, title, Icon }) => (
              <a
                key={id}
                href={settingsHref(id)}
                aria-current={section === id ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{title}</span>
              </a>
            ))}
          </nav>
          <div className="settings-sidebar-note">
            Your form and preferences are saved in this browser.
          </div>
        </aside>
        <section ref={scroll} className="settings-content" aria-labelledby="settings-title">
          <div className="settings-content-inner">
            <header className="settings-section-heading">
              <span className="settings-eyebrow">
                {section === 'layout' || section === 'details' ? 'YOUR FORM' : 'YOUR WORKSPACE'}
              </span>
              <h1 ref={heading} tabIndex={-1} id="settings-title">
                {active.title}
              </h1>
              <p>{active.description}</p>
            </header>
            {(saveError || preferences.error) && (
              <p className="settings-storage-error" role="alert">
                {saveError || preferences.error}
              </p>
            )}
            {section === 'layout' && (
              <>
                <section className="settings-section-card">
                  <h2>Label placement</h2>
                  <p>Applies to every field in this form, including fields inside groups.</p>
                  <div className="layout-choices" role="group" aria-label="Label placement">
                    {(['stacked', 'inline'] as const).map((layout) => (
                      <button
                        key={layout}
                        aria-pressed={doc.labelLayout === layout}
                        className={doc.labelLayout === layout ? 'active' : ''}
                        onClick={() => updateDocument({ labelLayout: layout })}
                      >
                        <span className={`layout-sample sample-${layout}`} aria-hidden="true">
                          <i />
                          <b />
                          <i />
                          <b />
                        </span>
                        <span className="layout-choice-title">
                          {layout === 'stacked' ? 'Above the control' : 'On the same row'}
                          {doc.labelLayout === layout && <Check size={16} />}
                        </span>
                        <small>
                          {layout === 'stacked'
                            ? 'Label above, value below'
                            : 'Label left, value right'}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="settings-layout-preview">
                    <span className="settings-preview-caption">LAYOUT PREVIEW</span>
                    <div className={`labels-${doc.labelLayout}`}>
                      <div className="field-body">
                        <label className="field-label" htmlFor="example-name">
                          Full name<span className="required">*</span>
                        </label>
                        <div className="field-value">
                          <input id="example-name" value="Alex Morgan" readOnly tabIndex={-1} />
                        </div>
                      </div>
                      <div className="field-body">
                        <label className="field-label" htmlFor="example-email">
                          Email address
                        </label>
                        <div className="field-value">
                          <input
                            id="example-email"
                            value="alex@example.com"
                            readOnly
                            tabIndex={-1}
                          />
                          <p className="field-description">We will send your confirmation here.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="settings-section-card settings-default-row">
                  <div>
                    <h2>Default for new forms</h2>
                    <p>
                      Currently:{' '}
                      {preferences.defaultLabelLayout === 'inline'
                        ? 'label and value on the same row'
                        : 'label above the control'}
                      . Existing forms keep their own layout.
                    </p>
                  </div>
                  <button
                    className="button"
                    disabled={preferences.defaultLabelLayout === doc.labelLayout}
                    onClick={() => preferences.update({ defaultLabelLayout: doc.labelLayout })}
                  >
                    {preferences.defaultLabelLayout === doc.labelLayout ? (
                      <>
                        <Check size={14} />
                        Already the default
                      </>
                    ) : (
                      'Make this the default'
                    )}
                  </button>
                </section>
                <p className="settings-bottom-note">
                  Layout changes are included in your exported schema. Field widths stay unchanged.
                </p>
              </>
            )}
            {section === 'details' && (
              <>
                <section className="settings-section-card">
                  <h2>Introduction</h2>
                  <p>Give your form a clear title and a little context.</p>
                  <TextSetting
                    label="Form title"
                    value={doc.title}
                    onChange={(title) => updateDocument({ title })}
                  />
                  <TextSetting
                    label="Description"
                    value={doc.description}
                    multiline
                    onChange={(description) => updateDocument({ description })}
                  />
                </section>
                <section className="settings-section-card">
                  <h2>Submission</h2>
                  <p>Customize the action and the message shown after submission.</p>
                  <TextSetting
                    label="Submit button"
                    value={doc.submitLabel}
                    onChange={(submitLabel) => updateDocument({ submitLabel })}
                  />
                  <TextSetting
                    label="Success message"
                    value={doc.successMessage}
                    multiline
                    onChange={(successMessage) => updateDocument({ successMessage })}
                  />
                </section>
              </>
            )}
            {section === 'appearance' && (
              <>
                <section className="settings-section-card">
                  <h2>Glass material</h2>
                  <p>Choose a lighter surface or extra contrast behind the controls.</p>
                  <div className="glass-choices" role="group" aria-label="Glass material">
                    {(['clear', 'frosted'] as const).map((glass) => (
                      <button
                        key={glass}
                        aria-pressed={preferences.glass === glass}
                        className={preferences.glass === glass ? 'active' : ''}
                        onClick={() => preferences.update({ glass })}
                      >
                        <span className={`glass-example glass-example-${glass}`} aria-hidden="true">
                          <i />
                          <b />
                          <b />
                        </span>
                        <strong>{glass === 'clear' ? 'Clear glass' : 'Frosted glass'}</strong>
                        <small>
                          {glass === 'clear'
                            ? 'Light and translucent'
                            : 'Softer background, stronger contrast'}
                        </small>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="settings-section-card">
                  <Toggle
                    label="Canvas grid"
                    hint="Show subtle alignment dots behind your form."
                    checked={preferences.canvasGrid}
                    onChange={(canvasGrid) => preferences.update({ canvasGrid })}
                  />
                </section>
                <section className="settings-section-card settings-default-row">
                  <div>
                    <h2>Form accent color</h2>
                    <p>Used for selected fields, controls and the submit button.</p>
                  </div>
                  <label className="accent-picker">
                    <input
                      aria-label="Form accent color"
                      type="color"
                      value={doc.accent}
                      onChange={(event) => updateDocument({ accent: event.target.value })}
                    />
                    <code>{doc.accent.toUpperCase()}</code>
                  </label>
                </section>
              </>
            )}
            {section === 'workspace' && (
              <>
                <section className="settings-section-card settings-default-row">
                  <div>
                    <h2>Preview size</h2>
                    <p>Switch between a responsive canvas and a phone-sized form.</p>
                  </div>
                  <div
                    className="segmented settings-segmented"
                    role="group"
                    aria-label="Preview size"
                  >
                    <button
                      aria-pressed={!mobile}
                      className={!mobile ? 'active' : ''}
                      onClick={() => onMobile(false)}
                    >
                      <Monitor size={16} />
                      Desktop
                    </button>
                    <button
                      aria-pressed={mobile}
                      className={mobile ? 'active' : ''}
                      onClick={() => onMobile(true)}
                    >
                      <Smartphone size={16} />
                      Phone
                    </button>
                  </div>
                </section>
                <section className="settings-section-card settings-default-row">
                  <div>
                    <h2>Workspace panels</h2>
                    <p>Keep the editing panels open, or give the canvas more room.</p>
                  </div>
                  <div
                    className="segmented settings-segmented"
                    role="group"
                    aria-label="Workspace panels"
                  >
                    <button
                      aria-pressed={panelsOpen}
                      className={panelsOpen ? 'active' : ''}
                      onClick={() => onPanels(true)}
                    >
                      <PanelLeftOpen size={16} />
                      Show panels
                    </button>
                    <button
                      aria-pressed={!panelsOpen}
                      className={!panelsOpen ? 'active' : ''}
                      onClick={() => onPanels(false)}
                    >
                      <PanelLeftClose size={16} />
                      Focus canvas
                    </button>
                  </div>
                </section>
                <section className="settings-section-card settings-default-row">
                  <div>
                    <h2>Edit history</h2>
                    <p>Undo or redo form changes without leaving settings.</p>
                  </div>
                  <div className="settings-actions">
                    <button className="button" disabled={!past.length} onClick={undo}>
                      <Undo2 size={16} />
                      Undo
                    </button>
                    <button className="button" disabled={!future.length} onClick={redo}>
                      <Redo2 size={16} />
                      Redo
                    </button>
                  </div>
                </section>
              </>
            )}
            {section === 'shortcuts' && (
              <section className="settings-section-card settings-shortcuts-table">
                <h2>Editor shortcuts</h2>
                <p>Text inputs keep their native editing shortcuts.</p>
                {[
                  ['Undo', 'Ctrl / ⌘ + Z'],
                  ['Redo', 'Ctrl / ⌘ + Shift + Z'],
                  ['Duplicate selected field', 'Ctrl / ⌘ + D'],
                  ['Delete selected field', 'Delete'],
                  ['Export schema', 'Ctrl / ⌘ + S'],
                  ['Search components', '/'],
                  ['Clear selection', 'Esc'],
                  ['Reorder selected field', 'Focus drag handle, then ↑ / ↓'],
                ].map(([label, key]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
