import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Copy,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import {
  catalog,
  findField,
  flatten,
  hasOptions,
  isContainer,
  isLayout,
  type Field,
  type Option,
} from '../model'
import { useStudio } from '../store'
import { FieldIcon, IconButton, SelectSetting, TextSetting, Toggle } from './ui'

export default function Inspector({
  onClose,
  perform,
}: {
  onClose: () => void
  perform: (action: () => void) => void
}) {
  const doc = useStudio((state) => state.doc),
    selected = useStudio((state) => state.selected)
  const field = selected ? findField(doc.fields, selected) : undefined
  return (
    <aside className="inspector-panel glass-surface">
      <div className="panel-title">
        <span>{field ? 'Inspector' : 'Form settings'}</span>
        <span className="tiny-label">{field ? 'INSPECT' : 'SETTINGS'}</span>
        <span className="panel-close">
          <IconButton label="Close inspector" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </span>
      </div>
      {field ? (
        <FieldInspector key={field.id} field={field} perform={perform} />
      ) : (
        <FormInspector perform={perform} />
      )}
      <div className="inspector-footnote">
        <CircleHelp size={14} />
        <span>Changes are saved in this browser</span>
      </div>
    </aside>
  )
}
function FormInspector({ perform }: { perform: (action: () => void) => void }) {
  const doc = useStudio((state) => state.doc),
    update = useStudio((state) => state.updateDocument)
  return (
    <div className="inspector-scroll">
      <div className="inspector-selection">
        <span className="selected-type-icon">
          <Settings2 size={20} />
        </span>
        <div>
          <strong>Make it your own</strong>
          <code>FORM SETTINGS</code>
        </div>
      </div>
      <section className="inspector-section">
        <h3>General</h3>
        <TextSetting label="Form title" value={doc.title} onChange={(title) => update({ title })} />
        <TextSetting
          label="Description"
          value={doc.description}
          multiline
          onChange={(description) => update({ description })}
        />
        <TextSetting
          label="Submit button"
          value={doc.submitLabel}
          onChange={(submitLabel) => update({ submitLabel })}
        />
        <TextSetting
          label="Success message"
          value={doc.successMessage}
          multiline
          onChange={(successMessage) => update({ successMessage })}
        />
      </section>
      <section className="inspector-section">
        <h3>Appearance</h3>
        <label className="setting">
          <span className="setting-label">Accent color</span>
          <div className="accent-picker">
            <input
              aria-label="Custom accent color"
              type="color"
              value={doc.accent}
              onChange={(e) => perform(() => update({ accent: e.target.value }))}
            />
            <code>{doc.accent.toUpperCase()}</code>
          </div>
        </label>
        <div className="color-presets">
          {['#176be8', '#3366cc', '#7253aa', '#b35732', '#334155'].map((color) => (
            <button
              key={color}
              style={{ background: color }}
              aria-label={`Use accent color ${color}`}
              className={color === doc.accent ? 'active' : ''}
              onClick={() => update({ accent: color })}
            />
          ))}
        </div>
      </section>
      <div className="inspector-note">
        <SlidersHorizontal size={17} />
        <p>Select a field on the canvas to edit its content, validation and visibility.</p>
      </div>
    </div>
  )
}
function FieldInspector({
  field,
  perform,
}: {
  field: Field
  perform: (action: () => void) => void
}) {
  const [tab, setTab] = useState<'general' | 'rules'>('general')
  const doc = useStudio((state) => state.doc),
    updateField = useStudio((state) => state.updateField)
  const update = (patch: Partial<Field>) => updateField(field.id, patch)
  const all = flatten(doc.fields),
    descendants = flatten([field]).map((item) => item.id)
  const parent = all.find((item) => item.children.some((child) => child.id === field.id))
  const siblingList = parent?.children ?? doc.fields,
    index = siblingList.findIndex((item) => item.id === field.id)
  return (
    <>
      <div className="inspector-selection">
        <span className="selected-type-icon">
          <FieldIcon type={field.type} size={21} />
        </span>
        <div>
          <strong>{catalog.find((item) => item.type === field.type)?.title}</strong>
          <code>{field.name}</code>
        </div>
        <span className="selection-badge">Selected</span>
      </div>
      <div className="inspector-tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          <SlidersHorizontal size={14} />
          Properties
        </button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          <Workflow size={14} />
          Conditions{field.rules.length > 0 && <span>{field.rules.length}</span>}
        </button>
      </div>
      <div className="inspector-scroll">
        {tab === 'general' ? (
          <>
            <section className="inspector-section">
              <h3>
                Content
                <ChevronDown size={13} />
              </h3>
              <TextSetting
                label="Label"
                value={field.title}
                onChange={(title) => update({ title })}
              />
              <TextSetting
                label="Field key"
                value={field.name}
                mono
                hint="A unique key in the submitted data"
                onChange={(name) => update({ name })}
              />
              {!isLayout(field.type) &&
                !['radio', 'checkbox', 'switch', 'slider', 'color'].includes(field.type) && (
                  <TextSetting
                    label="Placeholder"
                    value={field.placeholder}
                    onChange={(placeholder) => update({ placeholder })}
                  />
                )}
              <TextSetting
                label="Help text"
                value={field.description}
                multiline
                placeholder="Add a little context…"
                onChange={(description) => update({ description })}
              />
            </section>
            {hasOptions(field.type) && (
              <section className="inspector-section">
                <h3>
                  Options<span>{field.options.length} options</span>
                </h3>
                {field.type === 'cascader' ? (
                  <TextSetting
                    label="Cascading options (JSON)"
                    multiline
                    value={JSON.stringify(field.options, null, 2)}
                    onChange={(value) => update({ options: JSON.parse(value) as Option[] })}
                    hint="Supports label, value and children"
                  />
                ) : (
                  <>
                    {field.options.map((option, optionIndex) => (
                      <div className="option-editor" key={optionIndex}>
                        <div className="option-number">{optionIndex + 1}</div>
                        <div>
                          <TextSetting
                            label={`Option ${optionIndex + 1} label`}
                            value={option.label}
                            onChange={(label) =>
                              update({
                                options: field.options.map((item, i) =>
                                  i === optionIndex ? { ...item, label } : item,
                                ),
                              })
                            }
                          />
                          <TextSetting
                            label={`Option ${optionIndex + 1} value`}
                            mono
                            value={option.value}
                            onChange={(value) =>
                              update({
                                options: field.options.map((item, i) =>
                                  i === optionIndex ? { ...item, value } : item,
                                ),
                              })
                            }
                          />
                        </div>
                        <IconButton
                          label={`Remove option ${optionIndex + 1}`}
                          onClick={() =>
                            perform(() =>
                              update({
                                options: field.options.filter((_, i) => i !== optionIndex),
                              }),
                            )
                          }
                        >
                          <X size={13} />
                        </IconButton>
                      </div>
                    ))}
                    <button
                      className="button dashed full"
                      onClick={() => {
                        let i = field.options.length + 1
                        while (field.options.some((option) => option.value === `option_${i}`)) i++
                        perform(() =>
                          update({
                            options: [
                              ...field.options,
                              { label: `Option ${i}`, value: `option_${i}` },
                            ],
                          }),
                        )
                      }}
                    >
                      <Plus size={14} />
                      Add option
                    </button>
                  </>
                )}
              </section>
            )}
            <section className="inspector-section">
              <h3>
                Layout
                <ChevronDown size={13} />
              </h3>
              <span className="setting-label">Field width</span>
              <div className="segmented width-toggle">
                <button
                  className={field.width === 'full' ? 'active' : ''}
                  onClick={() => update({ width: 'full' })}
                >
                  <span className="width-symbol full-symbol" />
                  Full width
                </button>
                <button
                  className={field.width === 'half' ? 'active' : ''}
                  onClick={() => update({ width: 'half' })}
                >
                  <span className="width-symbol half-symbol" />
                  Half width
                </button>
              </div>
              {field.type === 'grid' && (
                <SelectSetting
                  label="Columns"
                  value={String(field.columns)}
                  onChange={(value) => update({ columns: Number(value) })}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value} columns
                    </option>
                  ))}
                </SelectSetting>
              )}
              <SelectSetting
                label="Parent container"
                value={parent?.id ?? ''}
                onChange={(value) =>
                  perform(() =>
                    useStudio
                      .getState()
                      .move(
                        field.id,
                        value || null,
                        value ? findField(doc.fields, value)!.children.length : doc.fields.length,
                      ),
                  )
                }
              >
                <option value="">Form root</option>
                {all
                  .filter((item) => isContainer(item.type) && !descendants.includes(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </SelectSetting>
            </section>
            {!isLayout(field.type) && (
              <section className="inspector-section">
                <h3>
                  Validation & behavior
                  <ChevronDown size={13} />
                </h3>
                <Toggle
                  label="Required"
                  hint="Must be completed before submitting"
                  checked={field.required}
                  onChange={(required) => update({ required })}
                />
                <Toggle
                  label="Read only"
                  checked={field.readOnly}
                  onChange={(readOnly) => update({ readOnly })}
                />
                <Toggle
                  label="Disabled"
                  checked={field.disabled}
                  onChange={(disabled) => update({ disabled })}
                />
                {['number', 'slider'].includes(field.type) && (
                  <div className="two-settings">
                    {(['min', 'max'] as const).map((key) => (
                      <TextSetting
                        key={key}
                        label={key === 'min' ? 'Minimum' : 'Maximum'}
                        value={field[key] === undefined ? '' : String(field[key])}
                        onChange={(value) =>
                          update({ [key]: value === '' ? undefined : Number(value) })
                        }
                      />
                    ))}
                  </div>
                )}
                {['text', 'email', 'textarea'].includes(field.type) && (
                  <TextSetting
                    label="Character limit"
                    value={field.maxLength ? String(field.maxLength) : ''}
                    placeholder="No limit"
                    onChange={(value) => update({ maxLength: value ? Number(value) : undefined })}
                  />
                )}
                {field.type === 'switch' ? (
                  <Toggle
                    label="On by default"
                    checked={field.defaultValue === true}
                    onChange={(defaultValue) => update({ defaultValue })}
                  />
                ) : (
                  <TextSetting
                    label={
                      ['checkbox', 'cascader'].includes(field.type)
                        ? 'Default value (JSON array)'
                        : 'Default value'
                    }
                    value={
                      Array.isArray(field.defaultValue)
                        ? JSON.stringify(field.defaultValue)
                        : String(field.defaultValue)
                    }
                    onChange={(value) =>
                      update({
                        defaultValue: ['checkbox', 'cascader'].includes(field.type)
                          ? JSON.parse(value)
                          : ['number', 'slider'].includes(field.type) && value
                            ? Number(value)
                            : value,
                      })
                    }
                  />
                )}
              </section>
            )}
            <section className="inspector-section field-management">
              <h3>Manage field</h3>
              <div className="button-row">
                <button
                  className="button"
                  disabled={index === 0}
                  onClick={() => perform(() => useStudio.getState().nudge(field.id, -1))}
                >
                  <ArrowUp size={14} />
                  Up
                </button>
                <button
                  className="button"
                  disabled={index === siblingList.length - 1}
                  onClick={() => perform(() => useStudio.getState().nudge(field.id, 1))}
                >
                  <ArrowDown size={14} />
                  Down
                </button>
                <button
                  className="button"
                  onClick={() => perform(() => useStudio.getState().duplicate(field.id))}
                >
                  <Copy size={14} />
                  Duplicate
                </button>
              </div>
              <button
                className="button danger full"
                onClick={() => perform(() => useStudio.getState().remove(field.id))}
              >
                <Trash2 size={14} />
                Delete field
              </button>
            </section>
          </>
        ) : (
          <>
            <section className="inspector-section">
              <h3>Visibility</h3>
              <Toggle
                label="Always hidden"
                hint="Exclude from preview and submitted data"
                checked={field.hidden}
                onChange={(hidden) => update({ hidden })}
              />
            </section>
            <section className="inspector-section">
              <h3>Conditional visibility</h3>
              <p className="setting-hint">
                Show this field when these conditions match. No conditions means always visible.
              </p>
              {field.rules.length > 0 && (
                <SelectSetting
                  label="Match conditions"
                  value={field.ruleMatch}
                  onChange={(value) => update({ ruleMatch: value as 'all' | 'any' })}
                >
                  <option value="all">All conditions (AND)</option>
                  <option value="any">Any condition (OR)</option>
                </SelectSetting>
              )}
              {field.rules.map((rule, i) => (
                <div className="rule-card" key={i}>
                  <header>
                    <span>Condition {i + 1}</span>
                    <IconButton
                      label={`Remove condition ${i + 1}`}
                      onClick={() =>
                        update({ rules: field.rules.filter((_, index) => index !== i) })
                      }
                    >
                      <X size={13} />
                    </IconButton>
                  </header>
                  <SelectSetting
                    label="When field"
                    value={rule.field}
                    onChange={(value) =>
                      update({
                        rules: field.rules.map((item, index) =>
                          index === i ? { ...item, field: value } : item,
                        ),
                      })
                    }
                  >
                    {all
                      .filter((item) => !isLayout(item.type) && item.id !== field.id)
                      .map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.title} · {item.name}
                        </option>
                      ))}
                  </SelectSetting>
                  <SelectSetting
                    label="Operator"
                    value={rule.operator}
                    onChange={(value) =>
                      update({
                        rules: field.rules.map((item, index) =>
                          index === i ? { ...item, operator: value as typeof rule.operator } : item,
                        ),
                      })
                    }
                  >
                    {[
                      ['equals', 'Equals'],
                      ['notEquals', 'Does not equal'],
                      ['contains', 'Contains'],
                      ['isEmpty', 'Is empty'],
                      ['isNotEmpty', 'Is not empty'],
                    ].map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                  </SelectSetting>
                  {!['isEmpty', 'isNotEmpty'].includes(rule.operator) && (
                    <TextSetting
                      label="Value"
                      value={rule.value}
                      hint="Use option values; use true / false for switches"
                      onChange={(value) =>
                        update({
                          rules: field.rules.map((item, index) =>
                            index === i ? { ...item, value } : item,
                          ),
                        })
                      }
                    />
                  )}
                </div>
              ))}
              <button
                className="button dashed full"
                disabled={!all.some((item) => !isLayout(item.type) && item.id !== field.id)}
                onClick={() =>
                  update({
                    rules: [
                      ...field.rules,
                      {
                        field: all.find((item) => !isLayout(item.type) && item.id !== field.id)!
                          .name,
                        operator: 'equals',
                        value: '',
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add condition
              </button>
            </section>
            <div className="inspector-note">
              <Workflow size={18} />
              <p>Open Preview and fill in related fields to test your conditions.</p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
