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
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  Command,
  FilePlus2,
  FileUp,
  Grid2X2,
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
  isLayout,
  starterDocument,
  type FieldType,
  type FormDocument,
} from './model'
import { downloadJson, exportSchema, parseText } from './schema'
import { useStudio } from './store'
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
    { doc, selected, saveError, past, future } = studio
  const [mode, setMode] = useState<Mode>('design'),
    [mobile, setMobile] = useState(false)
  const [drawer, setDrawer] = useState<'library' | 'inspector' | null>(null)
  const [dialog, setDialog] = useState<'templates' | 'shortcuts' | null>(null)
  const [toast, setToast] = useState(''),
    [dragType, setDragType] = useState<FieldType | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }))
  const count = flatten(doc.fields).filter((field) => !isLayout(field.type)).length
  const notify = (message: string) => setToast(message)
  const perform = (action: () => void) => {
    try {
      action()
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作未完成，请检查设置')
    }
  }
  const exportFile = () => {
    downloadJson(exportSchema(useStudio.getState().doc), 'form-schema.json')
    notify('Schema 已导出')
  }
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
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
        setDrawer('library')
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="搜索组件"]')?.focus(),
        )
      }
      if (event.key === 'Escape') {
        state.select(null)
        setDrawer(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])
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
      if (file.size > 2_000_000) throw new Error('文件不能超过 2 MB。')
      studio.replace(parseText(await file.text()))
      setMode('design')
      notify('导入成功，原表单可通过撤销恢复')
    } catch (e) {
      notify(e instanceof Error ? e.message : '文件读取失败')
    }
  }
  function applyTemplate(template: FormDocument) {
    studio.replace(template)
    setDialog(null)
    setMode('design')
    notify('模板已载入，可撤销恢复之前的表单')
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setMode('design')
          }}
          aria-label="Form Studio 设计工作台"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            Form<span className="brand-light"> Studio</span>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-breadcrumb">
          <span>我的工作空间</span>
          <ChevronRight size={14} />
          <strong>{doc.title}</strong>
          <span className="draft-badge">草稿</span>
        </div>
        <div className="header-actions">
          <span
            className={`save-status ${saveError ? 'save-error' : ''}`}
            title={saveError ?? '草稿保存在当前浏览器'}
          >
            {saveError ? <ShieldCheck size={14} /> : <Check size={14} />}
            {saveError ? '保存异常' : '已自动保存'}
          </span>
          <button className="button header-import" onClick={() => fileRef.current?.click()}>
            <FileUp size={15} />
            <span>导入</span>
          </button>
          <button className="button primary" onClick={exportFile}>
            <ArrowDownToLine size={15} />
            <span>导出 Schema</span>
          </button>
          <span className="avatar" title="本地工作空间">
            F
          </span>
        </div>
      </header>
      <div className="workspace-toolbar">
        <div className="workspace-location">
          <Grid2X2 size={16} />
          <span>表单工作台</span>
          <span className="version-label">2.0</span>
        </div>
        <nav className="mode-tabs" aria-label="工作模式">
          <button className={mode === 'design' ? 'active' : ''} onClick={() => setMode('design')}>
            <MousePointer2 size={15} />
            设计
          </button>
          <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>
            <Monitor size={15} />
            预览
          </button>
          <button className={mode === 'schema' ? 'active' : ''} onClick={() => setMode('schema')}>
            <Code2 size={16} />
            Schema
          </button>
        </nav>
        <div className="toolbar-actions">
          <IconButton
            label="撤销 (Ctrl+Z)"
            disabled={!past.length || mode !== 'design'}
            onClick={studio.undo}
          >
            <Undo2 size={17} />
          </IconButton>
          <IconButton
            label="重做 (Ctrl+Shift+Z)"
            disabled={!future.length || mode !== 'design'}
            onClick={studio.redo}
          >
            <Redo2 size={17} />
          </IconButton>
          <span className="action-divider" />
          <button
            className={`settings-button ${selected === null ? 'active' : ''}`}
            aria-label="表单设置"
            onClick={() => {
              studio.select(null)
              setDrawer('inspector')
              setMode('design')
            }}
          >
            <Settings2 size={16} />
            <span>表单设置</span>
          </button>
        </div>
      </div>
      {saveError && (
        <div className="save-banner" role="alert">
          {saveError}
          <button onClick={exportFile}>导出备份</button>
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
        <main className={`workspace mode-${mode} ${drawer ? `show-${drawer}` : ''}`}>
          {mode === 'design' && (
            <>
              <div className="drawer-scrim" onClick={() => setDrawer(null)} />
              <Library
                onTemplates={() => setDialog('templates')}
                onClose={() => setDrawer(null)}
                perform={perform}
              />
            </>
          )}
          <section
            className="canvas-panel"
            aria-label={
              mode === 'design' ? '表单设计画布' : mode === 'preview' ? '表单预览' : 'Schema 编辑'
            }
          >
            {mode !== 'schema' && (
              <div className="canvas-toolbar">
                <div className="canvas-toolbar-start">
                  {mode === 'design' ? (
                    <>
                      <span className="mobile-only">
                        <IconButton label="打开组件面板" onClick={() => setDrawer('library')}>
                          <PanelLeft size={17} />
                        </IconButton>
                      </span>
                      <span className="canvas-title">{doc.title}</span>
                      <span className="canvas-count">{count} 个字段</span>
                    </>
                  ) : (
                    <button className="text-button" onClick={() => setMode('design')}>
                      <ArrowLeft size={14} />
                      返回编辑
                    </button>
                  )}
                </div>
                <div className="device-toggle segmented" aria-label="画布尺寸">
                  <button
                    className={!mobile ? 'active' : ''}
                    aria-label="桌面端预览"
                    title="桌面端"
                    onClick={() => setMobile(false)}
                  >
                    <Monitor size={16} />
                  </button>
                  <button
                    className={mobile ? 'active' : ''}
                    aria-label="移动端预览"
                    title="移动端"
                    onClick={() => setMobile(true)}
                  >
                    <Smartphone size={15} />
                  </button>
                </div>
                <div className="canvas-toolbar-end">
                  <span className="zoom-label">100%</span>
                  {mode === 'design' && (
                    <span className="inspector-drawer-toggle">
                      <IconButton label="打开属性面板" onClick={() => setDrawer('inspector')}>
                        <PanelRight size={17} />
                      </IconButton>
                    </span>
                  )}
                </div>
              </div>
            )}
            {mode === 'design' ? (
              <Canvas
                mobile={mobile}
                perform={perform}
                onAdd={() => {
                  setDrawer('library')
                  document.querySelector<HTMLInputElement>('[aria-label="搜索组件"]')?.focus()
                }}
              />
            ) : mode === 'preview' ? (
              <Preview doc={doc} mobile={mobile} />
            ) : (
              <Suspense
                fallback={
                  <div className="loading-state">
                    <LoaderCircle className="spin" />
                    正在加载编辑器…
                  </div>
                }
              >
                <SchemaEditor doc={doc} onApply={(next) => studio.replace(next)} notify={notify} />
              </Suspense>
            )}
          </section>
          {mode === 'design' && <Inspector onClose={() => setDrawer(null)} perform={perform} />}
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
      <footer className="status-bar">
        <div>
          <span className="status-dot" />
          <span>本地工作空间</span>
          <span className="status-separator">/</span>
          <span>{flatten(doc.fields).length} 个组件</span>
          <span className="status-separator">/</span>
          <span>Schema v2</span>
        </div>
        <div>
          <span className="privacy-note">
            <ShieldCheck size={12} />
            数据留在你的浏览器
          </span>
          <button onClick={() => setDialog('shortcuts')}>
            <Command size={12} />
            快捷键
          </button>
        </div>
      </footer>
      <input
        type="file"
        ref={fileRef}
        accept=".json,application/json"
        className="visually-hidden"
        aria-label="导入 Schema 文件"
        onChange={importFile}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="关闭通知" onClick={() => setToast('')}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {dialog === 'shortcuts' && (
        <Modal
          title="用键盘，更进一步"
          subtitle="编辑文字时，保留输入框本身的快捷键。"
          onClose={() => setDialog(null)}
        >
          <div className="shortcut-list">
            {[
              ['撤销', 'Ctrl / ⌘ + Z'],
              ['重做', 'Ctrl / ⌘ + Shift + Z'],
              ['复制选中字段', 'Ctrl / ⌘ + D'],
              ['删除选中字段', 'Delete'],
              ['导出 Schema', 'Ctrl / ⌘ + S'],
              ['搜索组件', '/'],
              ['取消选中', 'Esc'],
              ['键盘排序', '聚焦拖动柄 → ↑ / ↓'],
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
          title="从一个好起点开始"
          subtitle="选择模板，继续创造。替换当前表单后，可以随时撤销。"
          onClose={() => setDialog(null)}
          wide
        >
          <div className="template-grid">
            <TemplateCard
              title="空白画布"
              description="自由构建你的下一个好表单"
              kind="blank"
              onClick={() => applyTemplate(emptyDocument())}
            />
            <TemplateCard
              title="活动报名"
              description="连接同频的人，让好想法发生"
              kind="event"
              onClick={() => applyTemplate(starterDocument())}
            />
            <TemplateCard
              title="意见反馈"
              description="认真倾听每一个声音"
              kind="feedback"
              onClick={() => applyTemplate(feedbackTemplate())}
            />
          </div>
        </Modal>
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
  doc.title = '期待听见你的声音'
  doc.description = '每一条建议，都让我们离更好的体验近一步。'
  doc.submitLabel = '发送反馈'
  doc.accent = '#7253aa'
  doc.fields = [
    {
      ...createField('radio'),
      name: 'rating',
      title: '整体体验如何？',
      required: true,
      options: [
        { label: '非常满意', value: 'great' },
        { label: '还不错', value: 'good' },
        { label: '有待改进', value: 'improve' },
      ],
    },
    {
      ...createField('textarea'),
      name: 'feedback',
      title: '有哪些值得改进的地方？',
      required: true,
      placeholder: '我们很想听听你的建议…',
    },
    {
      ...createField('email'),
      name: 'email',
      title: '留下邮箱，方便我们回复',
      placeholder: 'hello@example.com',
    },
  ]
  return doc
}
