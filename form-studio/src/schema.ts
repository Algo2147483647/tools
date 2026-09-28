import {
  documentSchema,
  emptyDocument,
  createField,
  isContainer,
  isLayout,
  uid,
  validName,
  type Field,
  type FieldType,
  type FormDocument,
  type Option,
} from './model'

const components: Record<FieldType, string> = {
  text: 'Input',
  email: 'Input',
  textarea: 'Textarea',
  number: 'InputNumber',
  select: 'Select',
  radio: 'Radio',
  checkbox: 'Checkbox',
  switch: 'Switch',
  date: 'DatePicker',
  time: 'TimePicker',
  color: 'ColorPicker',
  slider: 'Slider',
  cascader: 'Cascader',
  section: 'Card',
  grid: 'Grid',
  collapse: 'Collapse',
  divider: 'Divider',
}
const typeMap = Object.fromEntries(
  Object.entries(components)
    .filter(([key]) => key !== 'email')
    .map(([key, value]) => [value, key]),
) as Record<string, FieldType>
type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

export function exportSchema(doc: FormDocument) {
  const nodes = (fields: Field[]): JsonObject =>
    Object.fromEntries(
      fields.map((field, index) => [
        field.name,
        {
          type: isLayout(field.type)
            ? 'void'
            : ['number', 'slider'].includes(field.type)
              ? 'number'
              : field.type === 'switch'
                ? 'boolean'
                : ['checkbox', 'cascader'].includes(field.type)
                  ? 'array'
                  : 'string',
          name: field.name,
          title: field.title,
          description: field.description,
          required: field.required,
          default: field.defaultValue,
          ...(field.type === 'email' ? { format: 'email' } : {}),
          'x-component': components[field.type],
          'x-decorator': 'FormItem',
          'x-index': index,
          'x-hidden': field.hidden,
          'x-component-props': {
            placeholder: field.placeholder,
            disabled: field.disabled,
            readOnly: field.readOnly,
            ...(field.options.length ? { options: field.options } : {}),
            min: field.min,
            max: field.max,
            maxLength: field.maxLength,
            ...(isContainer(field.type) ? { columns: field.columns } : {}),
          },
          'x-studio': { id: field.id, width: field.width, type: field.type },
          ...(field.rules.length
            ? { 'x-visibility': { match: field.ruleMatch, rules: field.rules } }
            : {}),
          ...(isContainer(field.type) ? { properties: nodes(field.children) } : {}),
        },
      ]),
    )
  const { fields: _fields, ...settings } = doc
  return {
    form: { layout: 'vertical' },
    'x-studio': settings,
    schema: { type: 'object', properties: nodes(doc.fields) },
  }
}

function assertSafeShape(input: unknown) {
  const queue: [unknown, number][] = [[input, 0]]
  let count = 0
  while (queue.length) {
    const [value, depth] = queue.pop()!
    if (++count > 50000 || depth > 35) throw new Error('文件结构过大或嵌套过深，请简化后导入。')
    if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error(`不允许使用保留属性：${key}`)
        queue.push([child, depth + 1])
      }
  }
}
function options(input: unknown): Option[] {
  if (!Array.isArray(input)) return []
  return input.map((value) => {
    if (typeof value === 'string' || typeof value === 'number')
      return { label: String(value), value: String(value) }
    const item = object(value)
    return {
      label: String(item.label ?? item.value ?? ''),
      value: String(item.value ?? item.label ?? ''),
      ...(item.children ? { children: options(item.children) } : {}),
    }
  })
}
export function parseDocument(input: unknown): FormDocument {
  assertSafeShape(input)
  const root = object(input)
  let candidate: unknown = input
  if (root.version !== 2) {
    if (
      !root.schema ||
      !object(root.schema).properties ||
      Array.isArray(object(root.schema).properties)
    )
      throw new Error('需要 Form Studio 文档，或包含 schema.properties 的旧版 Schema。')
    const doc = {
      ...emptyDocument(),
      ...object(root['x-studio']),
      fields: [] as Field[],
      version: 2 as const,
    }
    const usedNames = new Set<string>()
    const read = (properties: JsonObject): Field[] =>
      Object.entries(properties)
        .sort((a, b) => Number(object(a[1])['x-index'] ?? 0) - Number(object(b[1])['x-index'] ?? 0))
        .map(([key, value]) => {
          const node = object(value),
            props = object(node['x-component-props']),
            meta = object(node['x-studio'])
          const component = str(node['x-component'])
          const type =
            component === 'Input' && (meta.type === 'email' || node.format === 'email')
              ? 'email'
              : typeMap[component]
          if (!type)
            throw new Error(
              `字段「${key}」使用了不支持的组件：${component || '未指定'}。请先转换，原表单未更改。`,
            )
          const validators = node['x-validator']
          if (
            node['x-reactions'] ||
            (validators &&
              (!Array.isArray(validators) ||
                validators.some((rule) => object(rule).ruleKey !== 'required')))
          )
            throw new Error(`字段「${key}」包含自定义脚本或校验器，请先转换为可视化规则。`)
          let name = str(node.name, key)
          if (usedNames.has(name)) name = key
          if (!validName(name))
            throw new Error(`字段「${key}」的标识「${name}」无效，请使用字母、数字与下划线。`)
          if (usedNames.has(name)) throw new Error(`字段标识重复：${name}`)
          usedNames.add(name)
          const field = {
            ...createField(type),
            id: str(meta.id, uid()),
            name,
            title: str(node.title, key),
            description: str(node.description),
            required:
              node.required === true ||
              (Array.isArray(validators) &&
                validators.some((rule) => object(rule).ruleKey === 'required')),
            hidden: node['x-hidden'] === true,
            disabled: props.disabled === true,
            readOnly: props.readOnly === true,
            placeholder: str(props.placeholder),
            width: meta.width === 'half' ? ('half' as const) : ('full' as const),
          }
          if (node.default !== undefined) field.defaultValue = node.default as Field['defaultValue']
          if (props.options !== undefined) field.options = options(props.options)
          for (const prop of ['min', 'max', 'maxLength'] as const)
            if (typeof props[prop] === 'number') field[prop] = props[prop]
          if (typeof props.columns === 'number') field.columns = props.columns
          const visibility = object(node['x-visibility'])
          field.ruleMatch = visibility.match === 'any' ? 'any' : 'all'
          const rules = Array.isArray(visibility.rules)
            ? visibility.rules
            : visibility.field
              ? [visibility]
              : []
          field.rules = rules.map((rule) => {
            const item = object(rule)
            return {
              field: str(item.field),
              operator: str(item.operator, 'equals') as Field['rules'][number]['operator'],
              value: String(item.value ?? ''),
            }
          })
          if (isContainer(type)) field.children = read(object(node.properties))
          if (type === 'divider' && props.content) field.title = String(props.content)
          if (type === 'collapse' && !field.children.length && Array.isArray(props.panels))
            field.children = props.panels.map((panel, index) => {
              const item = object(panel)
              return {
                ...createField('textarea'),
                name: `${field.name}_panel_${index + 1}`,
                title: str(item.title, `分组 ${index + 1}`),
                defaultValue: str(item.content),
                readOnly: true,
              }
            })
          return field
        })
    doc.fields = read(object(object(root.schema).properties))
    candidate = doc
  }
  const result = documentSchema.safeParse(candidate)
  if (!result.success)
    throw new Error(
      result.error.issues
        .slice(0, 4)
        .map((issue) => `${issue.path.length ? `${issue.path.join('.')}：` : ''}${issue.message}`)
        .join('\n'),
    )
  return result.data
}
export function parseText(text: string) {
  if (text.length > 2_000_000) throw new Error('文件不能超过 2 MB。')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式错误，请检查引号、逗号和括号。')
  }
  return parseDocument(value)
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
