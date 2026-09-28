import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { Braces, Check, Copy, Download, FileUp } from 'lucide-react'
import type { FormDocument } from '../model'
import { downloadJson, exportSchema, parseText } from '../schema'

export default function SchemaEditor({
  doc,
  onApply,
  notify,
}: {
  doc: FormDocument
  onApply: (doc: FormDocument) => void
  notify: (message: string) => void
}) {
  const [code, setCode] = useState(() => JSON.stringify(exportSchema(doc), null, 2)),
    [error, setError] = useState('')
  const original = JSON.stringify(exportSchema(doc), null, 2),
    dirty = code !== original
  const source = useRef(original)
  useEffect(() => {
    const previous = source.current
    source.current = original
    setCode((current) => (current === previous ? original : current))
  }, [original])
  return (
    <div className="schema-view">
      <div className="schema-intro">
        <span className="schema-icon">
          <Braces size={24} />
        </span>
        <div>
          <h1>Your form, in code.</h1>
          <p>Edit or paste a schema, then validate and apply it to your canvas.</p>
        </div>
      </div>
      <div className="editor-card">
        <header>
          <span>
            <span className="live-dot" />
            form-schema.json{dirty && <small>Unapplied changes</small>}
          </span>
          <div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code)
                  notify('Schema copied to clipboard')
                } catch {
                  notify('Could not copy. Select and copy the code manually.')
                }
              }}
            >
              <Copy size={14} />
              Copy
            </button>
            <button
              className="text-button"
              onClick={() => {
                try {
                  downloadJson(JSON.parse(code), 'form-schema.json')
                } catch {
                  setError('Fix the JSON syntax before exporting.')
                }
              }}
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </header>
        <CodeMirror
          value={code}
          height="100%"
          extensions={[json(), linter(jsonParseLinter()), lintGutter()]}
          onChange={(value) => {
            setCode(value)
            setError('')
          }}
          aria-label="JSON Schema editor"
          basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true }}
        />
        <footer>
          <span>
            {error ? (
              <span className="error-text" role="alert">
                {error}
              </span>
            ) : (
              <>
                <Check size={14} />
                Supports Form Studio v2 and legacy Formily schemas
              </>
            )}
          </span>
          <button
            className="button primary"
            onClick={() => {
              try {
                onApply(parseText(code))
                setError('')
                notify('Schema applied. Continue editing on the canvas.')
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Import failed')
              }
            }}
          >
            <FileUp size={15} />
            Apply to canvas
          </button>
        </footer>
      </div>
      <p className="schema-note">
        Apply your changes before leaving this view. Failed imports leave your current form
        unchanged.
      </p>
    </div>
  )
}
