import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronRight, Layers2, LayoutTemplate, Plus, Search, Shapes, X } from 'lucide-react'
import { catalog, isContainer, type Field, type FieldType } from '../model'
import { useStudio } from '../store'
import { FieldIcon, IconButton } from './ui'

function LibraryItem({
  item,
  add,
}: {
  item: (typeof catalog)[number]
  add: (type: FieldType) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library:${item.type}`,
    data: { type: item.type, library: true },
  })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`library-item ${isDragging ? 'dragging' : ''}`}
      onClick={() => add(item.type)}
      title={`${item.hint} · 点击或拖动添加`}
    >
      <FieldIcon type={item.type} />
      <span>{item.title}</span>
      <Plus size={12} className="library-plus" />
    </button>
  )
}
function Tree({ fields, depth = 0 }: { fields: Field[]; depth?: number }) {
  const selected = useStudio((state) => state.selected),
    select = useStudio((state) => state.select)
  return (
    <div className="tree-list">
      {fields.map((field) => (
        <div key={field.id}>
          <button
            className={`tree-item ${selected === field.id ? 'active' : ''}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => select(field.id)}
          >
            {isContainer(field.type) ? <ChevronRight size={12} /> : <span className="tree-dot" />}
            <FieldIcon type={field.type} size={15} />
            <span>{field.title || '未命名'}</span>
            {field.required && <span className="required">*</span>}
          </button>
          {field.children.length > 0 && <Tree fields={field.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  )
}
export default function Library({
  onTemplates,
  onClose,
  perform,
}: {
  onTemplates: () => void
  onClose: () => void
  perform: (action: () => void) => void
}) {
  const [tab, setTab] = useState<'components' | 'tree'>('components'),
    [search, setSearch] = useState('')
  const doc = useStudio((state) => state.doc),
    selected = useStudio((state) => state.selected),
    add = useStudio((state) => state.add)
  const filtered = catalog.filter((item) =>
    `${item.title} ${item.type} ${item.hint}`.toLowerCase().includes(search.toLowerCase()),
  )
  const groups = [...new Set(filtered.map((item) => item.group))]
  return (
    <aside className="library-panel">
      <div className="panel-title">
        <span>构建你的表单</span>
        <span className="tiny-label">BUILD</span>
        <span className="mobile-only">
          <IconButton label="关闭组件面板" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </span>
      </div>
      <div className="panel-tabs">
        <button
          className={tab === 'components' ? 'active' : ''}
          onClick={() => setTab('components')}
        >
          <Shapes size={15} />
          组件
        </button>
        <button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
          <Layers2 size={15} />
          结构
        </button>
      </div>
      <div className="library-scroll">
        {tab === 'components' ? (
          <>
            <div className="search-box">
              <Search size={15} />
              <input
                aria-label="搜索组件"
                placeholder="搜索组件…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </div>
            <p className="panel-caption">点击添加，或拖入画布</p>
            {groups.map((group) => (
              <section className="library-group" key={group}>
                <h3>
                  {group}
                  <span>
                    {filtered
                      .filter((item) => item.group === group)
                      .length.toString()
                      .padStart(2, '0')}
                  </span>
                </h3>
                <div className="library-grid">
                  {filtered
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <LibraryItem
                        key={item.type}
                        item={item}
                        add={(type) =>
                          perform(() => {
                            const parent = doc.fields.length ? selected : null
                            const selectedField = parent ? findContainer(doc.fields, parent) : false
                            add(type, selectedField ? parent : null)
                          })
                        }
                      />
                    ))}
                </div>
              </section>
            ))}
            {!filtered.length && (
              <div className="small-empty">
                没有找到相关组件
                <br />
                <button className="text-button" onClick={() => setSearch('')}>
                  清除搜索
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="panel-caption tree-caption">选择字段，在右侧调整层级与顺序</p>
            <button
              className={`tree-root ${!selected ? 'active' : ''}`}
              onClick={() => useStudio.getState().select(null)}
            >
              <Layers2 size={16} />
              {doc.title}
              <span>{doc.fields.length}</span>
            </button>
            <Tree fields={doc.fields} />
            {!doc.fields.length && (
              <div className="small-empty">添加组件后，结构会显示在这里。</div>
            )}
          </>
        )}
      </div>
      <button className="template-card" onClick={onTemplates}>
        <span className="template-icon">
          <LayoutTemplate size={19} />
        </span>
        <span>
          <strong>好表单，从模板开始</strong>
          <small>探索精心准备的起点</small>
        </span>
        <ChevronRight size={16} />
      </button>
    </aside>
  )
}
function findContainer(fields: Field[], id: string): boolean {
  return fields.some((field) =>
    field.id === id ? isContainer(field.type) : findContainer(field.children, id),
  )
}
