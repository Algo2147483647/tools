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
    <aside className="inspector-panel">
      <div className="panel-title">
        <span>{field ? '字段属性' : '表单设置'}</span>
        <span className="tiny-label">{field ? 'INSPECT' : 'SETTINGS'}</span>
        <span className="mobile-only">
          <IconButton label="关闭属性面板" onClick={onClose}>
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
        <span>所有更改自动保存到此浏览器</span>
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
          <strong>让表单成为你的作品</strong>
          <code>FORM SETTINGS</code>
        </div>
      </div>
      <section className="inspector-section">
        <h3>基本信息</h3>
        <TextSetting label="表单标题" value={doc.title} onChange={(title) => update({ title })} />
        <TextSetting
          label="表单描述"
          value={doc.description}
          multiline
          onChange={(description) => update({ description })}
        />
        <TextSetting
          label="提交按钮"
          value={doc.submitLabel}
          onChange={(submitLabel) => update({ submitLabel })}
        />
        <TextSetting
          label="提交成功提示"
          value={doc.successMessage}
          multiline
          onChange={(successMessage) => update({ successMessage })}
        />
      </section>
      <section className="inspector-section">
        <h3>外观设置</h3>
        <label className="setting">
          <span className="setting-label">表单主题色</span>
          <div className="accent-picker">
            <input
              aria-label="自定义主题色"
              type="color"
              value={doc.accent}
              onChange={(e) => perform(() => update({ accent: e.target.value }))}
            />
            <code>{doc.accent.toUpperCase()}</code>
          </div>
        </label>
        <div className="color-presets">
          {['#147d68', '#3366cc', '#7253aa', '#b35732', '#334155'].map((color) => (
            <button
              key={color}
              style={{ background: color }}
              aria-label={`使用主题色 ${color}`}
              className={color === doc.accent ? 'active' : ''}
              onClick={() => update({ accent: color })}
            />
          ))}
        </div>
      </section>
      <div className="inspector-note">
        <SlidersHorizontal size={17} />
        <p>点击画布中的任意字段，设置它的内容、校验和显示规则。</p>
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
        <span className="selection-badge">已选择</span>
      </div>
      <div className="inspector-tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          <SlidersHorizontal size={14} />
          基础设置
        </button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          <Workflow size={14} />
          显示规则{field.rules.length > 0 && <span>{field.rules.length}</span>}
        </button>
      </div>
      <div className="inspector-scroll">
        {tab === 'general' ? (
          <>
            <section className="inspector-section">
              <h3>
                字段内容
                <ChevronDown size={13} />
              </h3>
              <TextSetting
                label="字段标题"
                value={field.title}
                onChange={(title) => update({ title })}
              />
              <TextSetting
                label="字段标识"
                value={field.name}
                mono
                hint="用于提交数据的唯一键名"
                onChange={(name) => update({ name })}
              />
              {!isLayout(field.type) &&
                !['radio', 'checkbox', 'switch', 'slider', 'color'].includes(field.type) && (
                  <TextSetting
                    label="占位提示"
                    value={field.placeholder}
                    onChange={(placeholder) => update({ placeholder })}
                  />
                )}
              <TextSetting
                label="帮助说明"
                value={field.description}
                multiline
                placeholder="为填写者补充一点说明…"
                onChange={(description) => update({ description })}
              />
            </section>
            {hasOptions(field.type) && (
              <section className="inspector-section">
                <h3>
                  选项设置<span>{field.options.length} 项</span>
                </h3>
                {field.type === 'cascader' ? (
                  <TextSetting
                    label="级联选项 JSON"
                    multiline
                    value={JSON.stringify(field.options, null, 2)}
                    onChange={(value) => update({ options: JSON.parse(value) as Option[] })}
                    hint="支持 label、value 和 children"
                  />
                ) : (
                  <>
                    {field.options.map((option, optionIndex) => (
                      <div className="option-editor" key={optionIndex}>
                        <div className="option-number">{optionIndex + 1}</div>
                        <div>
                          <TextSetting
                            label={`选项 ${optionIndex + 1} 文本`}
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
                            label={`选项 ${optionIndex + 1} 值`}
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
                          label={`删除选项 ${optionIndex + 1}`}
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
                              { label: `选项 ${i}`, value: `option_${i}` },
                            ],
                          }),
                        )
                      }}
                    >
                      <Plus size={14} />
                      添加选项
                    </button>
                  </>
                )}
              </section>
            )}
            <section className="inspector-section">
              <h3>
                布局设置
                <ChevronDown size={13} />
              </h3>
              <span className="setting-label">字段宽度</span>
              <div className="segmented width-toggle">
                <button
                  className={field.width === 'full' ? 'active' : ''}
                  onClick={() => update({ width: 'full' })}
                >
                  <span className="width-symbol full-symbol" />
                  整行
                </button>
                <button
                  className={field.width === 'half' ? 'active' : ''}
                  onClick={() => update({ width: 'half' })}
                >
                  <span className="width-symbol half-symbol" />
                  半行
                </button>
              </div>
              {field.type === 'grid' && (
                <SelectSetting
                  label="栅格列数"
                  value={String(field.columns)}
                  onChange={(value) => update({ columns: Number(value) })}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value} 列
                    </option>
                  ))}
                </SelectSetting>
              )}
              <SelectSetting
                label="所属分组"
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
                <option value="">表单根节点</option>
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
                  校验与行为
                  <ChevronDown size={13} />
                </h3>
                <Toggle
                  label="必填字段"
                  hint="填写后才能提交表单"
                  checked={field.required}
                  onChange={(required) => update({ required })}
                />
                <Toggle
                  label="只读"
                  checked={field.readOnly}
                  onChange={(readOnly) => update({ readOnly })}
                />
                <Toggle
                  label="禁用字段"
                  checked={field.disabled}
                  onChange={(disabled) => update({ disabled })}
                />
                {['number', 'slider'].includes(field.type) && (
                  <div className="two-settings">
                    {(['min', 'max'] as const).map((key) => (
                      <TextSetting
                        key={key}
                        label={key === 'min' ? '最小值' : '最大值'}
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
                    label="最大字符数"
                    value={field.maxLength ? String(field.maxLength) : ''}
                    placeholder="不限"
                    onChange={(value) => update({ maxLength: value ? Number(value) : undefined })}
                  />
                )}
                {field.type === 'switch' ? (
                  <Toggle
                    label="默认开启"
                    checked={field.defaultValue === true}
                    onChange={(defaultValue) => update({ defaultValue })}
                  />
                ) : (
                  <TextSetting
                    label={
                      ['checkbox', 'cascader'].includes(field.type)
                        ? '默认值（JSON 数组）'
                        : '默认值'
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
              <h3>管理字段</h3>
              <div className="button-row">
                <button
                  className="button"
                  disabled={index === 0}
                  onClick={() => perform(() => useStudio.getState().nudge(field.id, -1))}
                >
                  <ArrowUp size={14} />
                  上移
                </button>
                <button
                  className="button"
                  disabled={index === siblingList.length - 1}
                  onClick={() => perform(() => useStudio.getState().nudge(field.id, 1))}
                >
                  <ArrowDown size={14} />
                  下移
                </button>
                <button
                  className="button"
                  onClick={() => perform(() => useStudio.getState().duplicate(field.id))}
                >
                  <Copy size={14} />
                  复制
                </button>
              </div>
              <button
                className="button danger full"
                onClick={() => perform(() => useStudio.getState().remove(field.id))}
              >
                <Trash2 size={14} />
                删除字段
              </button>
            </section>
          </>
        ) : (
          <>
            <section className="inspector-section">
              <h3>可见性</h3>
              <Toggle
                label="始终隐藏"
                hint="在预览和提交数据中排除此字段"
                checked={field.hidden}
                onChange={(hidden) => update({ hidden })}
              />
            </section>
            <section className="inspector-section">
              <h3>条件显示</h3>
              <p className="setting-hint">满足以下条件时显示，未设置条件则始终显示。</p>
              {field.rules.length > 0 && (
                <SelectSetting
                  label="条件关系"
                  value={field.ruleMatch}
                  onChange={(value) => update({ ruleMatch: value as 'all' | 'any' })}
                >
                  <option value="all">满足全部条件（AND）</option>
                  <option value="any">满足任意条件（OR）</option>
                </SelectSetting>
              )}
              {field.rules.map((rule, i) => (
                <div className="rule-card" key={i}>
                  <header>
                    <span>条件 {i + 1}</span>
                    <IconButton
                      label={`删除条件 ${i + 1}`}
                      onClick={() =>
                        update({ rules: field.rules.filter((_, index) => index !== i) })
                      }
                    >
                      <X size={13} />
                    </IconButton>
                  </header>
                  <SelectSetting
                    label="当字段"
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
                    label="判断方式"
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
                      ['equals', '等于'],
                      ['notEquals', '不等于'],
                      ['contains', '包含'],
                      ['isEmpty', '为空'],
                      ['isNotEmpty', '不为空'],
                    ].map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                  </SelectSetting>
                  {!['isEmpty', 'isNotEmpty'].includes(rule.operator) && (
                    <TextSetting
                      label="比较值"
                      value={rule.value}
                      hint="使用选项值；开关使用 true / false"
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
                添加显示条件
              </button>
            </section>
            <div className="inspector-note">
              <Workflow size={18} />
              <p>切换到「预览」，填写关联字段，即可检验显示逻辑。</p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
