import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { isContainer, type Field } from '../model'
import { useStudio } from '../store'
import { FieldBody } from './FieldControl'
import { FormHeading } from './Preview'
import { IconButton } from './ui'

function FieldCard({
  field,
  parent,
  index,
  perform,
}: {
  field: Field
  parent: string | null
  index: number
  perform: (action: () => void) => void
}) {
  const selected = useStudio((state) => state.selected),
    select = useStudio((state) => state.select)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { parent, index },
  })
  const active = selected === field.id
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`design-field ${field.width === 'half' ? 'half' : ''} ${active ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${field.hidden ? 'hidden-field' : ''}`}
      data-field-id={field.id}
      tabIndex={0}
      role="group"
      aria-label={`Edit ${field.title}`}
      onClick={(e) => {
        e.stopPropagation()
        select(field.id)
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
          e.preventDefault()
          select(field.id)
        }
      }}
    >
      {active && (
        <>
          <span className="selection-label">{field.name}</span>
          <div className="field-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-button drag-handle"
              {...attributes}
              {...listeners}
              aria-label={`Drag ${field.title}`}
              title="Drag to reorder, or use the up and down arrow keys"
              onKeyDown={(e) => {
                if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                  e.preventDefault()
                  e.stopPropagation()
                  perform(() => useStudio.getState().nudge(field.id, e.key === 'ArrowUp' ? -1 : 1))
                }
              }}
            >
              <GripVertical size={14} />
            </button>
            <IconButton
              label="Move field up"
              onClick={() => perform(() => useStudio.getState().nudge(field.id, -1))}
            >
              <ArrowUp size={13} />
            </IconButton>
            <IconButton
              label="Move field down"
              onClick={() => perform(() => useStudio.getState().nudge(field.id, 1))}
            >
              <ArrowDown size={13} />
            </IconButton>
            <IconButton
              label="Duplicate field"
              onClick={() => perform(() => useStudio.getState().duplicate(field.id))}
            >
              <Copy size={13} />
            </IconButton>
            <IconButton
              label="Delete field"
              onClick={() => perform(() => useStudio.getState().remove(field.id))}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        </>
      )}
      {field.type === 'divider' ? (
        <div className="form-divider">
          <span>{field.title}</span>
        </div>
      ) : isContainer(field.type) ? (
        <div className="design-container">
          <div className="container-heading">
            <span>{field.title}</span>
            <small>{field.type === 'grid' ? `${field.columns} columns` : 'Group'}</small>
          </div>
          <FieldList
            fields={field.children}
            parent={field.id}
            columns={field.type === 'grid' ? field.columns : undefined}
            perform={perform}
          />
        </div>
      ) : (
        <div className="design-control" inert>
          <FieldBody field={field} value={field.defaultValue} onChange={() => {}} design />
        </div>
      )}
      {(field.hidden || field.rules.length > 0) && (
        <span className="field-status">{field.hidden ? 'Hidden' : 'Conditional visibility'}</span>
      )}
    </div>
  )
}
export function FieldList({
  fields,
  parent = null,
  columns,
  perform,
}: {
  fields: Field[]
  parent?: string | null
  columns?: number
  perform: (action: () => void) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${parent ?? 'root'}`,
    data: { parent, index: fields.length, container: true },
  })
  return (
    <div
      ref={setNodeRef}
      className={`field-list ${isOver ? 'drop-over' : ''} ${columns ? 'grid-layout' : ''}`}
      style={{ '--columns': columns ?? 2 } as CSSProperties}
    >
      <SortableContext items={fields.map((field) => field.id)} strategy={rectSortingStrategy}>
        {fields.map((field, index) => (
          <FieldCard key={field.id} field={field} index={index} parent={parent} perform={perform} />
        ))}
      </SortableContext>
      {!fields.length && (
        <div className="drop-empty">
          <Plus size={20} />
          <span>Drop a component here</span>
          <small>Or select this group and add from the library</small>
        </div>
      )}
    </div>
  )
}
export default function Canvas({
  mobile,
  perform,
  onAdd,
}: {
  mobile: boolean
  perform: (action: () => void) => void
  onAdd: () => void
}) {
  const doc = useStudio((state) => state.doc),
    select = useStudio((state) => state.select)
  return (
    <div className="canvas-scroll">
      <div
        className={`form-paper labels-${doc.labelLayout} ${mobile ? 'mobile-paper' : ''}`}
        style={{ '--accent': doc.accent } as CSSProperties}
      >
        <button
          className="heading-select"
          onClick={() => select(null)}
          aria-label="Edit form title and settings"
        >
          <FormHeading doc={doc} />
        </button>
        <FieldList fields={doc.fields} perform={perform} />
        <button className="add-field" onClick={onAdd}>
          <Plus size={15} />
          Add a field<span>Choose a component from the library</span>
        </button>
        <div className="design-submit">
          <span>{doc.submitLabel}</span>
          <span>↗</span>
        </div>
        <div className="form-credit">
          Made with <strong>Form Studio</strong>
          <span>Made for meaningful responses</span>
        </div>
      </div>
    </div>
  )
}
