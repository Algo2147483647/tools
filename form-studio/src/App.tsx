import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Code2,
  Command,
  FilePlus2,
  FileUp,
  LayoutTemplate,
  LoaderCircle,
  Monitor,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Redo2,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import {
  catalog,
  createField,
  emptyDocument,
  findField,
  flatten,
  starterDocument,
  type FieldType,
  type FormDocument,
} from './model'
import { downloadJson, exportSchema, parseText } from './schema'
import { useStudio } from './store'
import { usePreferences } from './preferences'
import SettingsPage from './components/SettingsPage'
import { useSettingsRoute, settingsHref, type SettingsSection } from './settings-route'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import Library from './components/Library'
import Preview from './components/Preview'
import { FieldIcon, IconButton, Modal } from './components/ui'

const SchemaEditor = lazy(() => import('./components/SchemaEditor'))
type Mode = 'design' | 'preview' | 'schema'
const collision: CollisionDetection = (args) => {
  const inside = pointerWithin(args)
  if (!inside.length) return closestCenter(args)
  return inside.sort((a, b) => {
    const ar = args.droppableRects.get(a.id),
      br = args.droppableRects.get(b.id)
    return (ar ? ar.width * ar.height : Infinity) - (br ? br.width * br.height : Infinity)
  })
}

export default function App() {
  const studio = useStudio(),
    { doc, saveError, past, future } = studio
  const [mode, setMode] = useState<Mode>('design'),
    [mobile, setMobile] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [drawer, setDrawer] = useState<'library' | 'inspector' | null>(null)
  const [dialog, setDialog] = useState<'templates' | 'shortcuts' | null>(null)
  const settingsSection = useSettingsRoute()
  const lastSettingsSection = useRef<SettingsSection>('layout')
  const wasSettings = useRef(false)
  useEffect(() => {
    if (settingsSection) {
      lastSettingsSection.current = settingsSection
      setDialog(null)
      setDrawer(null)
    } else if (wasSettings.current) {
      document.getElementById('settings-trigger')?.focus()
    }
    wasSettings.current = !!settingsSection
    document.title = settingsSection
      ? 'Settings · Form Studio'
      : 'Form Studio · Visual form builder'
  }, [settingsSection])
  const [toast, setToast] = useState(''),
    [dragType, setDragType] = useState<FieldType | null>(null)
  const panelIsDrawer = (panel: 'library' | 'inspector') =>
    window.matchMedia(panel === 'library' ? '(max-width: 760px)' : '(max-width: 1100px)').matches
  const openPanel = (panel: 'library' | 'inspector') => {
    if (panelIsDrawer(panel)) setDrawer(panel)
    else if (panel === 'library') setLibraryOpen(true)
    else setInspectorOpen(true)
  }
  const closePanel = (panel: 'library' | 'inspector') => {
    setDrawer(null)
    if (!panelIsDrawer(panel)) {
      if (panel === 'library') setLibraryOpen(false)
      else setInspectorOpen(false)
    }
  }
  const togglePanel = (panel: 'library' | 'inspector') => {
    if (panelIsDrawer(panel)) setDrawer((current) => (current === panel ? null : panel))
    else if (panel === 'library') setLibraryOpen((value) => !value)
    else setInspectorOpen((value) => !value)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }))
  const preferences = usePreferences()
  const notify = (message: string) => setToast(message)
  const perform = (action: () => void) => {
    try {
      action()
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Could not complete the action. Check your settings.',
      )
    }
  }
  const exportFile = () => {
    downloadJson(exportSchema(useStudio.getState().doc), 'form-schema.json')
    notify('Schema exported')
  }
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsSection || document.querySelector('dialog[open]')) return
      const target = event.target as HTMLElement
      const editing = !!target.closest(
        'input, textarea, select, [contenteditable="true"], .cm-editor',
      )
      const mod = event.ctrlKey || event.metaKey
      const state = useStudio.getState()
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        exportFile()
        return
      }
      if (editing || mode !== 'design') return
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        state.redo()
      }
      if (mod && event.key.toLowerCase() === 'd' && state.selected) {
        event.preventDefault()
        perform(() => state.duplicate(state.selected!))
      }
      if (['Delete', 'Backspace'].includes(event.key) && state.selected) {
        event.preventDefault()
        perform(() => state.remove(state.selected!))
      }
      if (event.key === '/') {
        event.preventDefault()
        openPanel('library')
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Search components"]')?.focus(),
        )
      }
      if (event.key === 'Escape') {
        state.select(null)
        setDrawer(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, settingsSection])
  function dragEnd(event: DragEndEvent) {
    setDragType(null)
    if (!event.over || event.active.id === event.over.id) return
    const target = event.over.data.current
    if (!target) return
    perform(() => {
      if (event.active.data.current?.library)
        studio.add(event.active.data.current.type, target.parent ?? null, target.index)
      else studio.move(String(event.active.id), target.parent ?? null, target.index)
    })
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Files must be smaller than 2 MB.')
      studio.replace(parseText(await file.text()))
      setMode('design')
      notify('Imported successfully. Undo to restore your previous form.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not read the file.')
    }
  }
  function applyTemplate(template: FormDocument) {
    studio.replace({ ...template, labelLayout: usePreferences.getState().defaultLabelLayout })
    setDialog(null)
    setMode('design')
    notify('Template loaded. Undo to restore your previous form.')
  }
  return (
    <div
      className={`app-shell glass-${preferences.glass} ${preferences.canvasGrid ? '' : 'no-canvas-grid'}`}
    >
      <div className="editor-view" hidden={!!settingsSection}>
        <header className="app-header glass-surface" aria-label="Workspace toolbar">
          <div className="header-start">
            <IconButton
              label="Toggle component library"
              disabled={mode !== 'design'}
              onClick={() => togglePanel('library')}
            >
              <PanelLeft size={18} />
            </IconButton>
            <div className="document-info">
              <input
                className="document-title"
                aria-label="Document title"
                key={doc.title}
                defaultValue={doc.title}
                maxLength={150}
                onBlur={(event) =>
                  perform(() =>
                    studio.updateDocument({ title: event.target.value.trim() || 'Untitled form' }),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') {
                    event.currentTarget.value = doc.title
                    event.currentTarget.blur()
                  }
                }}
              />
              <span
                className={`save-status ${saveError ? 'save-error' : ''}`}
                title={saveError ?? 'Saved locally'}
                aria-label={saveError ? 'Save failed' : 'Saved locally'}
              >
                {saveError ? <ShieldCheck size={14} /> : <Check size={14} />}
              </span>
            </div>
            <div className="header-history">
              <IconButton
                label="Undo (Ctrl+Z)"
                disabled={!past.length || mode !== 'design'}
                onClick={studio.undo}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                label="Redo (Ctrl+Shift+Z)"
                disabled={!future.length || mode !== 'design'}
                onClick={studio.redo}
              >
                <Redo2 size={17} />
              </IconButton>
            </div>
          </div>
          <nav className="mode-tabs" aria-label="Workspace mode">
            <button
              aria-label="Design"
              title="Design"
              aria-pressed={mode === 'design'}
              className={mode === 'design' ? 'active' : ''}
              onClick={() => setMode('design')}
            >
              <MousePointer2 size={16} />
              <span>Design</span>
            </button>
            <button
              aria-label="Preview"
              title="Preview"
              aria-pressed={mode === 'preview'}
              className={mode === 'preview' ? 'active' : ''}
              onClick={() => setMode('preview')}
            >
              <Monitor size={16} />
              <span>Preview</span>
            </button>
            <button
              aria-label="Schema"
              title="Schema"
              aria-pressed={mode === 'schema'}
              className={mode === 'schema' ? 'active' : ''}
              onClick={() => setMode('schema')}
            >
              <Code2 size={17} />
              <span>Schema</span>
            </button>
          </nav>
          <div className="header-actions">
            <div className="device-toggle segmented" aria-label="Canvas size">
              <button
                aria-pressed={!mobile}
                className={!mobile ? 'active' : ''}
                aria-label="Desktop preview"
                title="Desktop preview"
                onClick={() => setMobile(false)}
              >
                <Monitor size={16} />
              </button>
              <button
                aria-pressed={mobile}
                className={mobile ? 'active' : ''}
                aria-label="Mobile preview"
                title="Mobile preview"
                onClick={() => setMobile(true)}
              >
                <Smartphone size={15} />
              </button>
            </div>
            <IconButton
              label="Toggle inspector"
              disabled={mode !== 'design'}
              onClick={() => togglePanel('inspector')}
            >
              <PanelRight size={18} />
            </IconButton>
            <IconButton
              label="Settings"
              id="settings-trigger"
              onClick={() => {
                window.location.hash = settingsHref(lastSettingsSection.current)
              }}
            >
              <Settings2 size={18} />
            </IconButton>
            <span className="header-separator" />
            <button
              className="button header-import"
              aria-label="Import"
              title="Import"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp size={16} />
              <span>Import</span>
            </button>
            <button
              className="button primary header-export"
              aria-label="Export Schema"
              title="Export Schema"
              onClick={exportFile}
            >
              <ArrowDownToLine size={16} />
              <span>Export Schema</span>
            </button>
          </div>
        </header>
        {saveError && (
          <div className="save-banner" role="alert">
            {saveError}
            <button onClick={exportFile}>Export backup</button>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={(event) =>
            setDragType(
              event.active.data.current?.type ??
                findField(doc.fields, String(event.active.id))?.type ??
                null,
            )
          }
          onDragEnd={dragEnd}
          onDragCancel={() => setDragType(null)}
        >
          <main
            className={`workspace mode-${mode} ${!libraryOpen ? 'hide-library' : ''} ${!inspectorOpen ? 'hide-inspector' : ''} ${drawer ? `show-${drawer}` : ''}`}
          >
            {mode === 'design' && (
              <>
                <div className="drawer-scrim" onClick={() => setDrawer(null)} />
                <Library
                  onTemplates={() => setDialog('templates')}
                  onClose={() => closePanel('library')}
                  perform={perform}
                />
              </>
            )}
            <section
              className="canvas-panel"
              aria-label={
                mode === 'design'
                  ? 'Form design canvas'
                  : mode === 'preview'
                    ? 'Form preview'
                    : 'Schema editor'
              }
            >
              {mode === 'design' ? (
                <Canvas
                  mobile={mobile}
                  perform={perform}
                  onAdd={() => {
                    openPanel('library')
                    document
                      .querySelector<HTMLInputElement>('[aria-label="Search components"]')
                      ?.focus()
                  }}
                />
              ) : mode === 'preview' ? (
                <Preview doc={doc} mobile={mobile} />
              ) : (
                <Suspense
                  fallback={
                    <div className="loading-state">
                      <LoaderCircle className="spin" />
                      Loading editor…
                    </div>
                  }
                >
                  <SchemaEditor
                    doc={doc}
                    onApply={(next) => studio.replace(next)}
                    notify={notify}
                  />
                </Suspense>
              )}
            </section>
            {mode === 'design' && (
              <Inspector onClose={() => closePanel('inspector')} perform={perform} />
            )}
          </main>
          <DragOverlay>
            {dragType && (
              <div className="drag-overlay">
                <FieldIcon type={dragType} />
                <span>{catalog.find((item) => item.type === dragType)?.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        <footer className="status-bar glass-surface">
          <div>
            <span className="status-dot" />
            <span>Local workspace</span>
            <span className="status-separator">/</span>
            <span>{flatten(doc.fields).length} components</span>
            <span className="status-separator">/</span>
            <span>Schema v2</span>
          </div>
          <div>
            <span className="privacy-note">
              <ShieldCheck size={12} />
              Your data stays in this browser
            </span>
            <button onClick={() => setDialog('shortcuts')}>
              <Command size={12} />
              Shortcuts
            </button>
          </div>
        </footer>
        <input
          type="file"
          ref={fileRef}
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Import Schema file"
          onChange={importFile}
        />
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <IconButton label="Dismiss notification" onClick={() => setToast('')}>
              <X size={15} />
            </IconButton>
          </div>
        )}
        {dialog === 'shortcuts' && (
          <Modal
            title="Keyboard shortcuts"
            subtitle="Text inputs keep their native editing shortcuts."
            onClose={() => setDialog(null)}
          >
            <div className="shortcut-list">
              {[
                ['Undo', 'Ctrl / ⌘ + Z'],
                ['Redo', 'Ctrl / ⌘ + Shift + Z'],
                ['Duplicate selected field', 'Ctrl / ⌘ + D'],
                ['Delete selected field', 'Delete'],
                ['Export Schema', 'Ctrl / ⌘ + S'],
                ['Search components', '/'],
                ['Clear selection', 'Esc'],
                ['Reorder fields', 'Focus drag handle, then ↑ / ↓'],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
          </Modal>
        )}
        {dialog === 'templates' && (
          <Modal
            title="Start with something good"
            subtitle="Choose a starting point and make it yours. You can undo replacing your form."
            onClose={() => setDialog(null)}
            wide
          >
            <div className="template-grid">
              <TemplateCard
                title="Blank canvas"
                description="A fresh start for your next idea."
                kind="blank"
                onClick={() => applyTemplate(emptyDocument())}
              />
              <TemplateCard
                title="Event registration"
                description="Bring curious people together."
                kind="event"
                onClick={() => applyTemplate(starterDocument())}
              />
              <TemplateCard
                title="Feedback survey"
                description="Make every response count."
                kind="feedback"
                onClick={() => applyTemplate(feedbackTemplate())}
              />
            </div>
          </Modal>
        )}
      </div>
      {settingsSection && (
        <SettingsPage
          section={settingsSection}
          mobile={mobile}
          onMobile={setMobile}
          panelsOpen={libraryOpen || inspectorOpen}
          onPanels={(show) => {
            setLibraryOpen(show)
            setInspectorOpen(show)
            setDrawer(null)
          }}
          onBack={() => {
            window.location.hash = ''
          }}
        />
      )}
    </div>
  )
}
function TemplateCard({
  title,
  description,
  kind,
  onClick,
}: {
  title: string
  description: string
  kind: string
  onClick: () => void
}) {
  const Icon = kind === 'blank' ? FilePlus2 : kind === 'event' ? Sparkles : LayoutTemplate
  return (
    <button className={`template-option template-${kind}`} onClick={onClick}>
      <div className="template-illustration">
        <Icon size={27} />
        <span />
        <span />
        <span />
        <i />
      </div>
      <strong>
        {title}
        <ArrowUpRight size={16} />
      </strong>
      <p>{description}</p>
    </button>
  )
}
function feedbackTemplate(): FormDocument {
  const doc = emptyDocument()
  doc.title = 'We would love your feedback'
  doc.description = 'Help us make your next experience even better.'
  doc.submitLabel = 'Send feedback'
  doc.accent = '#7253aa'
  doc.fields = [
    {
      ...createField('radio'),
      name: 'rating',
      title: 'How was your experience?',
      required: true,
      options: [
        { label: 'Excellent', value: 'great' },
        { label: 'Good', value: 'good' },
        { label: 'Could be better', value: 'improve' },
      ],
    },
    {
      ...createField('textarea'),
      name: 'feedback',
      title: 'What could we improve?',
      required: true,
      placeholder: 'Share your ideas with us…',
    },
    {
      ...createField('email'),
      name: 'email',
      title: 'Your email for a follow-up',
      placeholder: 'hello@example.com',
    },
  ]
  return doc
}
