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
export type LabelLayout = 'stacked' | 'inline'
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
  labelLayout: LabelLayout
  fields: Field[]
}
export const catalog: { type: FieldType; title: string; hint: string; group: string }[] = [
  { type: 'text', title: 'Short text', hint: 'Names and short answers', group: 'Basic fields' },
  {
    type: 'textarea',
    title: 'Long text',
    hint: 'Descriptions and longer answers',
    group: 'Basic fields',
  },
  { type: 'number', title: 'Number', hint: 'Quantities and values', group: 'Basic fields' },
  { type: 'email', title: 'Email', hint: 'Validated email addresses', group: 'Basic fields' },
  { type: 'select', title: 'Dropdown', hint: 'Choose from a dropdown', group: 'Choice fields' },
  {
    type: 'radio',
    title: 'Single choice',
    hint: 'Choose one visible option',
    group: 'Choice fields',
  },
  {
    type: 'checkbox',
    title: 'Checkboxes',
    hint: 'Choose one or more options',
    group: 'Choice fields',
  },
  { type: 'switch', title: 'Switch', hint: 'A simple on or off choice', group: 'Choice fields' },
  {
    type: 'cascader',
    title: 'Cascader',
    hint: 'Connected levels of options',
    group: 'Choice fields',
  },
  { type: 'date', title: 'Date', hint: 'Pick a calendar date', group: 'Advanced fields' },
  { type: 'time', title: 'Time', hint: 'Pick a time', group: 'Advanced fields' },
  { type: 'slider', title: 'Slider', hint: 'Choose a value in a range', group: 'Advanced fields' },
  { type: 'color', title: 'Color', hint: 'Pick a custom color', group: 'Advanced fields' },
  { type: 'section', title: 'Section', hint: 'Group related fields', group: 'Layout' },
  { type: 'grid', title: 'Grid', hint: 'Arrange fields in columns', group: 'Layout' },
  { type: 'collapse', title: 'Accordion', hint: 'Expand content on demand', group: 'Layout' },
  { type: 'divider', title: 'Divider', hint: 'Separate your content', group: 'Layout' },
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
    placeholder: type === 'select' ? 'Select an option' : 'Enter a value',
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
              ? '#176be8'
              : '',
    options: hasOptions(type)
      ? [
          { label: 'Option 1', value: 'option_1' },
          { label: 'Option 2', value: 'option_2' },
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
    name: z
      .string()
      .refine(
        validName,
        'Field keys must use letters, numbers or underscores and cannot start with a number.',
      ),
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
    labelLayout: z.enum(['stacked', 'inline']).default('stacked'),
    fields: z.array(fieldSchema),
  })
  .superRefine((doc, ctx) => {
    const names = new Set<string>(),
      ids = new Set<string>()
    const all = flatten(doc.fields)
    if (all.length > 500)
      ctx.addIssue({ code: 'custom', message: 'A form can contain up to 500 components.' })
    for (const field of all) {
      if (names.has(field.name) || ids.has(field.id))
        ctx.addIssue({ code: 'custom', message: `Duplicate field key or ID: ${field.name}` })
      names.add(field.name)
      ids.add(field.id)
      if (!isContainer(field.type) && field.children.length)
        ctx.addIssue({ code: 'custom', message: `${field.title} cannot contain child components.` })
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        ctx.addIssue({ code: 'custom', message: `${field.title} minimum cannot exceed maximum.` })
      const values = field.options.map((option) => option.value)
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', message: `${field.title} has duplicate option values.` })
      const checkOptions = (items: Option[]) => {
        const seen = new Set<string>()
        for (const item of items) {
          if (!item.value || seen.has(item.value))
            ctx.addIssue({
              code: 'custom',
              message: `${field.title} option values must be nonempty and unique.`,
            })
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
        if (!valid)
          ctx.addIssue({
            code: 'custom',
            message: `${field.title} has an invalid default value type.`,
          })
        if (field.type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(String(value)))
          ctx.addIssue({
            code: 'custom',
            message: `${field.title} default color must be a six-digit hex value.`,
          })
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
            message: `${field.title} has an invalid condition reference: ${rule.field}`,
          })
      }
  })

export function emptyDocument(): FormDocument {
  return {
    version: 2,
    title: 'Untitled form',
    description: 'A good conversation starts with a few thoughtful questions.',
    submitLabel: 'Submit form',
    successMessage: 'Thank you! Your response is ready.',
    accent: '#176be8',
    labelLayout: 'stacked',
    fields: [],
  }
}
export function starterDocument(): FormDocument {
  const doc = emptyDocument()
  doc.title = 'Creative workshop'
  doc.description =
    'A space for curious minds and fresh ideas.\nJoin our next hands-on workshop. Tell us a little about yourself.'
  doc.submitLabel = 'Reserve my spot'
  const field = (type: FieldType, name: string, title: string, config: Partial<Field> = {}) => ({
    ...createField(type),
    name,
    title,
    ...config,
  })
  doc.fields = [
    field('text', 'name', 'Full name', {
      required: true,
      placeholder: 'What should we call you?',
      width: 'half',
    }),
    field('text', 'company', 'Company or team', {
      placeholder: 'Where do you work?',
      width: 'half',
    }),
    field('email', 'email', 'Email address', {
      required: true,
      placeholder: 'hello@example.com',
      description: 'We will send your invitation and event details here.',
    }),
    field('select', 'role', 'What is your role?', {
      required: true,
      placeholder: 'Select your role',
      options: [
        { label: 'Product designer', value: 'designer' },
        { label: 'Developer', value: 'developer' },
        { label: 'Product manager', value: 'pm' },
        { label: 'Something else', value: 'other' },
      ],
    }),
    field('radio', 'session', 'Choose your session', {
      required: true,
      defaultValue: 'morning',
      options: [
        { label: 'Morning · 10:00 AM', value: 'morning' },
        { label: 'Afternoon · 2:00 PM', value: 'afternoon' },
      ],
    }),
    field('textarea', 'expectation', 'Anything you would like to share?', {
      placeholder: 'Your expectations, ideas or questions…',
      maxLength: 500,
    }),
    field('switch', 'subscribe', 'Keep me in the loop', {
      description: 'Occasional updates about workshops worth joining.',
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
        errors[field.name] = `${field.title} is required.`
      if (empty) return
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        errors[field.name] = 'Enter a valid email address.'
      if (['number', 'slider'].includes(field.type)) {
        if (typeof value !== 'number' || !Number.isFinite(value))
          errors[field.name] = 'Enter a valid number.'
        else if (field.min !== undefined && value < field.min)
          errors[field.name] = `Must be at least ${field.min}`
        else if (field.max !== undefined && value > field.max)
          errors[field.name] = `Must be at most ${field.max}`
      }
      if (field.maxLength && String(value).length > field.maxLength)
        errors[field.name] = `Use at most ${field.maxLength} characters.`
      if (['select', 'radio', 'checkbox'].includes(field.type)) {
        const choices = Array.isArray(value) ? value : [String(value)]
        if (choices.some((choice) => !field.options.some((option) => option.value === choice)))
          errors[field.name] = 'Select a valid option.'
      }
      if (field.type === 'cascader') {
        let level = field.options
        for (const choice of Array.isArray(value) ? value : []) {
          const option = level.find((item) => item.value === choice)
          if (!option) {
            errors[field.name] = 'Select a valid option.'
            break
          }
          level = option.children ?? []
        }
        if (level.length) errors[field.name] = 'Complete every level of the selection.'
      }
    })
  visit(fields)
  return { errors, data }
}
