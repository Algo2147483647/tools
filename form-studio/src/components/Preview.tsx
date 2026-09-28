import { useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowRight, Check, CheckCheck, Download, RotateCcw } from 'lucide-react'
import {
  initialValues,
  isContainer,
  isVisible,
  validateValues,
  type Field,
  type FormDocument,
  type Values,
} from '../model'
import { downloadJson } from '../schema'
import { FieldBody } from './FieldControl'

export function FormHeading({ doc }: { doc: FormDocument }) {
  return (
    <div className="form-heading">
      <div className="form-emblem">
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="form-kicker">LET’S MAKE SOMETHING GREAT</span>
      <h1>{doc.title}</h1>
      <p>{doc.description}</p>
    </div>
  )
}
export default function Preview({ doc, mobile }: { doc: FormDocument; mobile: boolean }) {
  const [values, setValues] = useState<Values>(() => initialValues(doc.fields))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Values | null>(null)
  const [copied, setCopied] = useState(false)
  const reset = () => {
    setValues(initialValues(doc.fields))
    setErrors({})
    setResult(null)
  }
  function render(fields: Field[]) {
    return fields
      .filter((field) => isVisible(field, values))
      .map((field) => {
        if (field.type === 'divider')
          return (
            <div key={field.id} className="form-divider">
              <span>{field.title}</span>
            </div>
          )
        if (isContainer(field.type)) {
          const content = (
            <fieldset
              disabled={field.disabled || field.readOnly}
              className={`form-grid nested-fieldset ${field.type === 'grid' ? 'runtime-grid' : ''}`}
              style={{ '--columns': field.type === 'grid' ? field.columns : 2 } as CSSProperties}
            >
              {render(field.children)}
            </fieldset>
          )
          if (field.type === 'collapse')
            return (
              <details className="form-section" key={field.id} open>
                <summary>{field.title}</summary>
                {content}
              </details>
            )
          return (
            <section className="form-section" key={field.id}>
              <h3>{field.title}</h3>
              {field.description && <p>{field.description}</p>}
              {content}
            </section>
          )
        }
        return (
          <div key={field.id} className={`preview-field ${field.width === 'half' ? 'half' : ''}`}>
            <FieldBody
              field={field}
              value={values[field.name] ?? ''}
              error={errors[field.name]}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field.name]: value }))
                setErrors((current) => {
                  const next = { ...current }
                  delete next[field.name]
                  return next
                })
              }}
            />
          </div>
        )
      })
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const checked = validateValues(doc.fields, values)
    setErrors(checked.errors)
    if (!Object.keys(checked.errors).length) setResult(checked.data)
    else
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
  }
  return (
    <div className="preview-stage">
      <div className="preview-notice">
        <span className="live-dot" />
        实时预览 · 数据仅在当前浏览器中演示
      </div>
      <div
        className={`form-paper preview-paper ${mobile ? 'mobile-paper' : ''}`}
        style={{ '--accent': doc.accent } as CSSProperties}
      >
        {result ? (
          <div className="success-state">
            <div className="success-icon">
              <CheckCheck size={32} />
            </div>
            <span className="eyebrow">ALL SET!</span>
            <h1>{doc.successMessage || '提交成功！'}</h1>
            <p>以下是本次提交的数据，可复制或下载用于开发联调。</p>
            <pre>{JSON.stringify(result, null, 2)}</pre>
            <div className="button-row">
              <button
                className="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? <Check size={16} /> : null}
                {copied ? '已复制' : '复制数据'}
              </button>
              <button className="button" onClick={() => downloadJson(result, 'form-response.json')}>
                <Download size={16} />
                下载数据
              </button>
              <button className="button primary" onClick={reset}>
                再次填写
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <FormHeading doc={doc} />
            <div className="form-grid">{render(doc.fields)}</div>
            {Object.keys(errors).length > 0 && (
              <p className="validation-summary" role="alert">
                还有 {Object.keys(errors).length} 项需要检查，请查看字段下方的提示。
              </p>
            )}
            <div className="form-submit">
              <button className="button primary submit-button" type="submit">
                {doc.submitLabel}
                <ArrowRight size={17} />
              </button>
              <button className="text-button" type="button" onClick={reset}>
                <RotateCcw size={13} />
                重新填写
              </button>
            </div>
          </form>
        )}
        <div className="form-credit">
          Made with <strong>Form Studio</strong>
          <span>用心收集每一个回答</span>
        </div>
      </div>
    </div>
  )
}
