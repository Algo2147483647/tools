import { z } from 'zod'

export const fieldTypes = [
  'text',
  'email',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'switch',
  'date',
  'time',
  'color',
  'slider',
  'cascader',
  'section',
  'grid',
  'collapse',
  'divider',
] as const
export type FieldType = (typeof fieldTypes)[number]
export type Value = string | number | boolean | string[]
export type Values = Record<string, Value>
export type Option = { label: string; value: string; children?: Option[] }
export type Rule = {
  field: string
  operator: 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty'
  value: string
}
export interface Field {
  id: string
  type: FieldType
  name: string
  title: string
  description: string
  placeholder: string
  required: boolean
  disabled: boolean
  readOnly: boolean
  hidden: boolean
  width: 'full' | 'half'
  defaultValue: Value
  options: Option[]
  min?: number
  max?: number
  maxLength?: number
  columns: number
  rules: Rule[]
  ruleMatch: 'all' | 'any'
  children: Field[]
}
export interface FormDocument {
  version: 2
  title: string
  description: string
  submitLabel: string
  successMessage: string
  accent: string
  fields: Field[]
}
export const catalog: { type: FieldType; title: string; hint: string; group: string }[] = [
  { type: 'text', title: '单行文本', hint: '姓名、简短回答', group: '基础字段' },
  { type: 'textarea', title: '多行文本', hint: '描述与长回答', group: '基础字段' },
  { type: 'number', title: '数字', hint: '数量与数值', group: '基础字段' },
  { type: 'email', title: '邮箱', hint: '自动校验格式', group: '基础字段' },
  { type: 'select', title: '下拉选择', hint: '展开选择一项', group: '选择字段' },
  { type: 'radio', title: '单项选择', hint: '平铺展示选项', group: '选择字段' },
  { type: 'checkbox', title: '多项选择', hint: '选择一个或多个', group: '选择字段' },
  { type: 'switch', title: '开关', hint: '开启或关闭', group: '选择字段' },
  { type: 'cascader', title: '级联选择', hint: '多级关联选项', group: '选择字段' },
  { type: 'date', title: '日期', hint: '选择日历日期', group: '高级字段' },
  { type: 'time', title: '时间', hint: '选择具体时间', group: '高级字段' },
  { type: 'slider', title: '滑动条', hint: '范围内选择数值', group: '高级字段' },
  { type: 'color', title: '颜色', hint: '自定义颜色', group: '高级字段' },
  { type: 'section', title: '分组卡片', hint: '组织相关字段', group: '布局组件' },
  { type: 'grid', title: '栅格布局', hint: '灵活的多列排版', group: '布局组件' },
  { type: 'collapse', title: '折叠分组', hint: '按需展开内容', group: '布局组件' },
  { type: 'divider', title: '分割线', hint: '分隔不同内容', group: '布局组件' },
]
export const isContainer = (type: FieldType) => ['section', 'grid', 'collapse'].includes(type)
export const isLayout = (type: FieldType) => isContainer(type) || type === 'divider'
export const hasOptions = (type: FieldType) =>
  ['select', 'radio', 'checkbox', 'cascader'].includes(type)
export const uid = () => crypto.randomUUID()
export const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) => [field, ...flatten(field.children)])
export const findField = (fields: Field[], id: string): Field | undefined =>
  flatten(fields).find((field) => field.id === id)
export const validName = (name: string) =>
  /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name)

export function createField(type: FieldType, fields: Field[] = []): Field {
  const names = new Set(flatten(fields).map((field) => field.name))
  let index = 1
  while (names.has(`${type}_${index}`)) index++
  return {
    id: uid(),
    type,
    name: `${type}_${index}`,
    title: catalog.find((item) => item.type === type)!.title,
    description: '',
    placeholder: type === 'select' ? '请选择' : '请输入',
    required: false,
    disabled: false,
    readOnly: false,
    hidden: false,
    width: 'full',
    defaultValue:
      type === 'switch'
        ? false
        : ['checkbox', 'cascader'].includes(type)
          ? []
          : type === 'slider'
            ? 0
            : type === 'color'
              ? '#147d68'
              : '',
    options: hasOptions(type)
      ? [
          { label: '选项一', value: 'option_1' },
          { label: '选项二', value: 'option_2' },
        ]
      : [],
    columns: 2,
    rules: [],
    ruleMatch: 'all',
    children: [],
    ...(type === 'slider' ? { min: 0, max: 100 } : {}),
  }
}

const optionSchema: z.ZodType<Option> = z.lazy(() =>
  z.object({ label: z.string(), value: z.string(), children: z.array(optionSchema).optional() }),
)
const valueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string())])
const ruleSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty']),
  value: z.string(),
})
const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(fieldTypes),
    name: z.string().refine(validName, '字段标识须为字母、数字或下划线，且不能以数字开头'),
    title: z.string(),
    description: z.string(),
    placeholder: z.string(),
    required: z.boolean(),
    disabled: z.boolean(),
    readOnly: z.boolean(),
    hidden: z.boolean(),
    width: z.enum(['full', 'half']),
    defaultValue: valueSchema,
    options: z.array(optionSchema),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    maxLength: z.number().int().positive().optional(),
    columns: z.number().int().min(1).max(4),
    rules: z.array(ruleSchema),
    ruleMatch: z.enum(['all', 'any']),
    children: z.array(fieldSchema),
  }),
)
export const documentSchema = z
  .object({
    version: z.literal(2),
    title: z.string().min(1).max(150),
    description: z.string(),
    submitLabel: z.string().min(1),
    successMessage: z.string(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fields: z.array(fieldSchema),
  })
  .superRefine((doc, ctx) => {
    const names = new Set<string>(),
      ids = new Set<string>()
    const all = flatten(doc.fields)
    if (all.length > 500) ctx.addIssue({ code: 'custom', message: '最多支持 500 个组件' })
    for (const field of all) {
      if (names.has(field.name) || ids.has(field.id))
        ctx.addIssue({ code: 'custom', message: `重复的字段标识或 ID：${field.name}` })
      names.add(field.name)
      ids.add(field.id)
      if (!isContainer(field.type) && field.children.length)
        ctx.addIssue({ code: 'custom', message: `${field.title} 不能包含子组件` })
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        ctx.addIssue({ code: 'custom', message: `${field.title} 的最小值不能大于最大值` })
      const values = field.options.map((option) => option.value)
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', message: `${field.title} 的选项值重复` })
      const checkOptions = (items: Option[]) => {
        const seen = new Set<string>()
        for (const item of items) {
          if (!item.value || seen.has(item.value))
            ctx.addIssue({ code: 'custom', message: `${field.title} 的选项值不能为空或重复` })
          seen.add(item.value)
          if (item.children) checkOptions(item.children)
        }
      }
      checkOptions(field.options)
      if (!isLayout(field.type)) {
        const value = field.defaultValue
        const valid =
          field.type === 'switch'
            ? typeof value === 'boolean'
            : ['checkbox', 'cascader'].includes(field.type)
              ? Array.isArray(value)
              : ['number', 'slider'].includes(field.type)
                ? value === '' || typeof value === 'number'
                : typeof value === 'string'
        if (!valid) ctx.addIssue({ code: 'custom', message: `${field.title} 的默认值类型不正确` })
        if (field.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(String(value)))
          ctx.addIssue({ code: 'custom', message: `${field.title} 的默认颜色须为六位十六进制色值` })
      }
    }
    for (const field of all)
      for (const rule of field.rules) {
        if (
          !all.some((item) => item.name === rule.field && !isLayout(item.type)) ||
          rule.field === field.name
        )
          ctx.addIssue({
            code: 'custom',
            message: `${field.title} 的显示条件引用无效：${rule.field}`,
          })
      }
  })

export function emptyDocument(): FormDocument {
  return {
    version: 2,
    title: '未命名表单',
    description: '填写以下信息，开启一段新的连接。',
    submitLabel: '提交表单',
    successMessage: '提交成功，感谢你的填写！',
    accent: '#147d68',
    fields: [],
  }
}
export function starterDocument(): FormDocument {
  const doc = emptyDocument()
  doc.title = '创意工作坊报名'
  doc.description = '让灵感相遇，让好想法发生。\n欢迎加入我们的线下创意工作坊，请留下你的信息。'
  doc.submitLabel = '提交报名'
  const field = (type: FieldType, name: string, title: string, config: Partial<Field> = {}) => ({
    ...createField(type),
    name,
    title,
    ...config,
  })
  doc.fields = [
    field('text', 'name', '你的姓名', {
      required: true,
      placeholder: '怎么称呼你？',
      width: 'half',
    }),
    field('text', 'company', '公司 / 团队', { placeholder: '你所在的公司或团队', width: 'half' }),
    field('email', 'email', '电子邮箱', {
      required: true,
      placeholder: 'hello@example.com',
      description: '我们会通过邮件发送活动详情与入场凭证。',
    }),
    field('select', 'role', '你目前的角色', {
      required: true,
      placeholder: '选择最适合你的角色',
      options: [
        { label: '产品设计师', value: 'designer' },
        { label: '开发工程师', value: 'developer' },
        { label: '产品经理', value: 'pm' },
        { label: '其他探索者', value: 'other' },
      ],
    }),
    field('radio', 'session', '想参加哪个场次？', {
      required: true,
      defaultValue: 'morning',
      options: [
        { label: '上午场 · 10:00', value: 'morning' },
        { label: '下午场 · 14:00', value: 'afternoon' },
      ],
    }),
    field('textarea', 'expectation', '有什么想提前告诉我们？', {
      placeholder: '聊聊你的期待，或想探讨的话题…',
      maxLength: 500,
    }),
    field('switch', 'subscribe', '接收后续活动通知', {
      description: '偶尔分享一些值得参与的好活动。',
      defaultValue: true,
    }),
  ]
  return doc
}

export function isVisible(field: Field, values: Values): boolean {
  if (field.hidden) return false
  if (!field.rules.length) return true
  const checks = field.rules.map((rule) => {
    const value = values[rule.field]
    const empty =
      value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (rule.operator === 'isEmpty') return empty
    if (rule.operator === 'isNotEmpty') return !empty
    if (rule.operator === 'contains')
      return Array.isArray(value)
        ? value.includes(rule.value)
        : String(value ?? '').includes(rule.value)
    const equal = Array.isArray(value)
      ? value.includes(rule.value)
      : String(value ?? '') === rule.value
    return rule.operator === 'equals' ? equal : !equal
  })
  return field.ruleMatch === 'all' ? checks.every(Boolean) : checks.some(Boolean)
}
export function initialValues(fields: Field[]): Values {
  return Object.fromEntries(
    flatten(fields)
      .filter((field) => !isLayout(field.type))
      .map((field) => [field.name, field.defaultValue]),
  )
}
export function validateValues(fields: Field[], values: Values) {
  const errors: Record<string, string> = {},
    data: Values = {}
  const visit = (items: Field[]) =>
    items.forEach((field) => {
      if (!isVisible(field, values) || field.disabled) return
      if (isLayout(field.type)) {
        visit(field.children)
        return
      }
      const value = values[field.name] ?? ''
      data[field.name] = value
      const empty =
        value === '' ||
        (Array.isArray(value) && !value.length) ||
        (typeof value === 'string' && !value.trim())
      if (field.required && (empty || (field.type === 'switch' && value !== true)))
        errors[field.name] = `请${hasOptions(field.type) ? '选择' : '填写'}${field.title}`
      if (empty) return
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        errors[field.name] = '请输入有效的邮箱地址'
      if (['number', 'slider'].includes(field.type)) {
        if (typeof value !== 'number' || !Number.isFinite(value))
          errors[field.name] = '请输入有效的数字'
        else if (field.min !== undefined && value < field.min)
          errors[field.name] = `不能小于 ${field.min}`
        else if (field.max !== undefined && value > field.max)
          errors[field.name] = `不能大于 ${field.max}`
      }
      if (field.maxLength && String(value).length > field.maxLength)
        errors[field.name] = `最多填写 ${field.maxLength} 个字符`
      if (['select', 'radio', 'checkbox'].includes(field.type)) {
        const choices = Array.isArray(value) ? value : [String(value)]
        if (choices.some((choice) => !field.options.some((option) => option.value === choice)))
          errors[field.name] = '请选择有效选项'
      }
      if (field.type === 'cascader') {
        let level = field.options
        for (const choice of Array.isArray(value) ? value : []) {
          const option = level.find((item) => item.value === choice)
          if (!option) {
            errors[field.name] = '请选择有效选项'
            break
          }
          level = option.children ?? []
        }
        if (level.length) errors[field.name] = '请完成所有层级的选择'
      }
    })
  visit(fields)
  return { errors, data }
}
