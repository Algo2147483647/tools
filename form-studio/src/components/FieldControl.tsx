import { ChevronDown, Mail } from 'lucide-react'
import type { Field, Option, Value } from '../model'

export function FieldControl({
  field,
  value,
  onChange,
  error,
  design = false,
}: {
  field: Field
  value: Value
  onChange: (value: Value) => void
  error?: string
  design?: boolean
}) {
  const id = `${design ? 'design' : 'preview'}-${field.id}`
  const disabled = field.disabled || field.readOnly
  const common = {
    id,
    name: field.name,
    disabled: field.disabled,
    readOnly: field.readOnly,
    'aria-label': field.title,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : field.description ? `${id}-description` : undefined,
    'aria-required': field.required,
    tabIndex: design ? -1 : undefined,
  }
  const stringValue = typeof value === 'string' || typeof value === 'number' ? value : ''
  if (field.type === 'textarea')
    return (
      <textarea
        {...common}
        placeholder={field.placeholder}
        rows={3}
        maxLength={field.maxLength}
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  if (field.type === 'select')
    return (
      <span className="select-wrap">
        <select
          {...common}
          disabled={disabled}
          value={String(stringValue)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.placeholder || 'Select an option'}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} />
      </span>
    )
  if (field.type === 'radio' || field.type === 'checkbox')
    return (
      <div className="choice-group" role="group" aria-label={field.title}>
        {field.options.map((option) => (
          <label className="choice" key={option.value}>
            <input
              {...common}
              id={`${id}-${option.value}`}
              type={field.type}
              disabled={disabled}
              aria-label={option.label}
              value={option.value}
              checked={
                field.type === 'radio'
                  ? value === option.value
                  : Array.isArray(value) && value.includes(option.value)
              }
              onChange={(e) =>
                onChange(
                  field.type === 'radio'
                    ? option.value
                    : e.target.checked
                      ? [...(Array.isArray(value) ? value : []), option.value]
                      : (Array.isArray(value) ? value : []).filter((item) => item !== option.value),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    )
  if (field.type === 'switch')
    return (
      <label className="switch-control">
        <input
          {...common}
          type="checkbox"
          role="switch"
          className="toggle-input"
          disabled={disabled}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
        <span>{value ? 'On' : 'Off'}</span>
      </label>
    )
  if (field.type === 'slider')
    return (
      <div className="range-control">
        <input
          {...common}
          disabled={disabled}
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          value={typeof value === 'number' ? value : (field.min ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output htmlFor={id}>{String(value)}</output>
      </div>
    )
  if (field.type === 'color')
    return (
      <div className="color-control">
        <input
          {...common}
          disabled={disabled}
          type="color"
          value={String(value || '#176be8')}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="mono">{String(value || '#176be8')}</span>
      </div>
    )
  if (field.type === 'cascader') {
    const path = Array.isArray(value) ? value : [],
      levels: Option[][] = [field.options]
    let current = field.options
    for (const item of path) {
      const found = current.find((option) => option.value === item)
      if (!found?.children?.length) break
      current = found.children
      levels.push(current)
    }
    return (
      <div className="cascader-control">
        {levels.map((level, index) => (
          <select
            {...common}
            key={index}
            id={`${id}-${index}`}
            aria-label={`${field.title}, level ${index + 1}`}
            disabled={disabled}
            value={path[index] ?? ''}
            onChange={(e) =>
              onChange([...path.slice(0, index), ...(e.target.value ? [e.target.value] : [])])
            }
          >
            <option value="">Select an option</option>
            {level.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </div>
    )
  }
  return (
    <span className={`input-wrap ${field.type === 'email' ? 'with-icon' : ''}`}>
      {field.type === 'email' && <Mail size={16} />}
      <input
        {...common}
        type={['date', 'time', 'email', 'number'].includes(field.type) ? field.type : 'text'}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        maxLength={field.maxLength}
        value={stringValue}
        onChange={(e) =>
          onChange(
            field.type === 'number' && e.target.value !== ''
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </span>
  )
}

export function FieldBody({
  field,
  value,
  onChange,
  error,
  design,
}: {
  field: Field
  value: Value
  onChange: (value: Value) => void
  error?: string
  design?: boolean
}) {
  const id = `${design ? 'design' : 'preview'}-${field.id}`
  return (
    <div className="field-body">
      <label className="field-label" htmlFor={id}>
        {field.title || 'Untitled field'}
        {field.required && <span className="required">*</span>}
      </label>
      <div className="field-value">
        <FieldControl
          field={field}
          value={value}
          onChange={onChange}
          error={error}
          design={design}
        />
        {field.description && (
          <p id={`${id}-description`} className="field-description">
            {field.description}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
