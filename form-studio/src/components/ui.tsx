import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlignLeft,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Clock3,
  Columns2,
  Folder,
  Hash,
  ListChecks,
  Mail,
  Minus,
  Network,
  Palette,
  PanelTop,
  SlidersHorizontal,
  SquareCheck,
  TextCursorInput,
  ToggleRight,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { FieldType } from '../model'

export const icons: Record<FieldType, LucideIcon> = {
  text: Type,
  email: Mail,
  textarea: AlignLeft,
  number: Hash,
  select: ListChecks,
  radio: CircleDot,
  checkbox: SquareCheck,
  switch: ToggleRight,
  date: CalendarDays,
  time: Clock3,
  color: Palette,
  slider: SlidersHorizontal,
  cascader: Network,
  section: PanelTop,
  grid: Columns2,
  collapse: Folder,
  divider: Minus,
}
export function FieldIcon({ type, size = 18 }: { type: FieldType; size?: number }) {
  const Icon = icons[type] || TextCursorInput
  return <Icon size={size} strokeWidth={1.65} />
}
export function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} {...props}>
      {children}
    </button>
  )
}
export function TextSetting({
  label,
  value,
  onChange,
  multiline,
  hint,
  mono,
  ...props
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  hint?: string
  mono?: boolean
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  useEffect(() => {
    setDraft(value)
    setError('')
  }, [value])
  const commit = () => {
    try {
      onChange(draft)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid setting')
    }
  }
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      {multiline ? (
        <textarea
          {...props}
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          {...props}
          className={mono ? 'mono' : ''}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      )}
      {error ? (
        <span className="error-text" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="setting-hint">{hint}</span>
      )}
    </label>
  )
}
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  hint?: string
}) {
  return (
    <label className="toggle-setting">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        className="toggle-input"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}
export function SelectSetting({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <ChevronDown size={14} />
      </span>
    </label>
  )
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose()
        }
      }}
      aria-label={title}
    >
      <header className="modal-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </header>
      {children}
    </dialog>
  )
}
