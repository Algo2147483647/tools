import { useState } from 'react'
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
  return (
    <div className="schema-view">
      <div className="schema-intro">
        <span className="schema-icon">
          <Braces size={24} />
        </span>
        <div>
          <h1>设计与代码，保持同频。</h1>
          <p>编辑或粘贴 Schema，校验通过后即可应用到画布。</p>
        </div>
      </div>
      <div className="editor-card">
        <header>
          <span>
            <span className="live-dot" />
            form-schema.json{dirty && <small>未应用</small>}
          </span>
          <div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code)
                  notify('Schema 已复制到剪贴板')
                } catch {
                  notify('复制失败，请在编辑器中手动选择复制')
                }
              }}
            >
              <Copy size={14} />
              复制
            </button>
            <button
              className="text-button"
              onClick={() => {
                try {
                  downloadJson(JSON.parse(code), 'form-schema.json')
                } catch {
                  setError('请先修正 JSON 语法后导出。')
                }
              }}
            >
              <Download size={14} />
              导出
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
          aria-label="JSON Schema 编辑器"
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
                支持 Form Studio v2 与旧版 Formily Schema
              </>
            )}
          </span>
          <button
            className="button primary"
            onClick={() => {
              try {
                onApply(parseText(code))
                setError('')
                notify('Schema 已应用，可在设计画布中继续编辑')
              } catch (e) {
                setError(e instanceof Error ? e.message : '导入失败')
              }
            }}
          >
            <FileUp size={15} />
            应用到画布
          </button>
        </footer>
      </div>
      <p className="schema-note">关闭此页面不会应用未保存的代码。导入失败时，当前表单保持不变。</p>
    </div>
  )
}
