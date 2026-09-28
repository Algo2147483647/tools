import { describe, expect, it } from 'vitest'
import {
  createField,
  emptyDocument,
  fieldTypes,
  initialValues,
  isVisible,
  starterDocument,
  validateValues,
} from './model'
import { exportSchema, parseDocument, parseText } from './schema'

describe('Schema integrity and migration', () => {
  it('preserves inline label layout through JSON export and import', () => {
    const doc = starterDocument()
    doc.labelLayout = 'inline'
    const exported = exportSchema(doc)
    expect(exported.form.layout).toBe('horizontal')
    expect(parseText(JSON.stringify(exported))).toEqual(doc)
  })
  it('keeps older v2 documents stacked when no layout is specified', () => {
    const { labelLayout: _layout, ...oldDocument } = starterDocument()
    expect(parseDocument(oldDocument).labelLayout).toBe('stacked')
  })
  it('imports legacy horizontal layouts and rejects invalid layout values', () => {
    expect(
      parseDocument({ form: { layout: 'horizontal' }, schema: { properties: {} } }).labelLayout,
    ).toBe('inline')
    expect(() => parseDocument({ ...emptyDocument(), labelLayout: 'unsupported' })).toThrow()
  })
  it('round-trips every supported field, nested layout, typed default and condition', () => {
    const doc = emptyDocument()
    doc.fields = fieldTypes.map((type) => createField(type))
    doc.fields[0].name = 'controller'
    const child = {
      ...createField('number'),
      name: 'nested_number',
      min: 3,
      max: 20,
      defaultValue: 5,
      rules: [{ field: 'controller', operator: 'equals' as const, value: 'show' }],
    }
    doc.fields.find((field) => field.type === 'grid')!.children = [child]
    expect(parseDocument(JSON.parse(JSON.stringify(exportSchema(doc))))).toEqual(doc)
  })
  it('migrates original required validators and duplicate legacy names without losing fields', () => {
    const doc = parseDocument({
      schema: {
        properties: {
          input_1: {
            name: 'input',
            title: 'Name',
            'x-component': 'Input',
            'x-validator': [{ ruleKey: 'required' }],
            required: true,
          },
          input_2: { name: 'input', title: 'Company', 'x-component': 'Input', 'x-validator': [] },
        },
      },
    })
    expect(doc.fields.map((field) => field.name)).toEqual(['input', 'input_2'])
    expect(doc.fields[0].required).toBe(true)
  })
  it('retains old collapse content and normalizes choice values', () => {
    const doc = parseDocument({
      schema: {
        properties: {
          collapse: {
            'x-component': 'Collapse',
            'x-component-props': { panels: [{ title: 'Details', content: 'Keep this text' }] },
          },
          select: {
            'x-component': 'Select',
            'x-component-props': { options: ['A', { label: 'B', value: 2 }] },
          },
        },
      },
    })
    expect(doc.fields[0].children[0].defaultValue).toBe('Keep this text')
    expect(doc.fields[1].options).toEqual([
      { label: 'A', value: 'A' },
      { label: 'B', value: '2' },
    ])
  })
  it('rejects unknown components instead of dropping them', () => {
    expect(() =>
      parseDocument({ schema: { properties: { test: { 'x-component': 'Unknown' } } } }),
    ).toThrow('unsupported')
  })
  it('rejects dangerous keys, malformed JSON, excessive depth, and invalid defaults', () => {
    expect(() => parseText('{broken')).toThrow('JSON')
    expect(() => parseText('{"__proto__":{}}')).toThrow('Reserved property')
    let deep: unknown = {}
    for (let i = 0; i < 40; i++) deep = { child: deep }
    expect(() => parseDocument(deep)).toThrow('deeply nested')
    const doc = emptyDocument()
    doc.fields = [{ ...createField('switch'), defaultValue: 'false' }]
    expect(() => parseDocument(doc)).toThrow('default value type')
  })
  it('rejects duplicate identifiers, invalid ranges and broken rule references', () => {
    const doc = starterDocument()
    doc.fields[1].name = doc.fields[0].name
    expect(() => parseDocument(doc)).toThrow('Duplicate')
    const numeric = emptyDocument()
    numeric.fields = [{ ...createField('number'), min: 5, max: 1 }]
    expect(() => parseDocument(numeric)).toThrow('minimum')
    numeric.fields = [
      { ...createField('text'), rules: [{ field: 'missing', operator: 'equals', value: '' }] },
    ]
    expect(() => parseDocument(numeric)).toThrow('invalid condition reference')
  })
})
describe('Preview semantics', () => {
  it('validates required/email without coercing 0 or false to empty', () => {
    const fields = [
      { ...createField('number'), required: true, min: 0 },
      { ...createField('email'), required: true },
      createField('switch'),
    ]
    const checked = validateValues(fields, { number_1: 0, email_1: 'bad', switch_1: false })
    expect(checked.errors).toEqual({ email_1: 'Enter a valid email address.' })
    expect(checked.data.number_1).toBe(0)
    expect(checked.data.switch_1).toBe(false)
  })
  it('excludes hidden descendants and disabled fields from validation and data', () => {
    const fields = [
      {
        ...createField('section'),
        hidden: true,
        children: [{ ...createField('email'), required: true }],
      },
      { ...createField('text'), disabled: true, required: true },
    ]
    expect(validateValues(fields, initialValues(fields))).toEqual({ errors: {}, data: {} })
  })
  it('evaluates all/any rules and array choices consistently', () => {
    const field = {
      ...createField('text'),
      rules: [
        { field: 'roles', operator: 'contains' as const, value: 'dev' },
        { field: 'company', operator: 'isNotEmpty' as const, value: '' },
      ],
    }
    expect(isVisible(field, { roles: ['dev'], company: '' })).toBe(false)
    expect(isVisible({ ...field, ruleMatch: 'any' }, { roles: ['dev'], company: '' })).toBe(true)
    expect(isVisible({ ...field, hidden: true }, { roles: ['dev'], company: 'Team' })).toBe(false)
  })
  it('requires complete cascader paths and preserves selected leaf values', () => {
    const field = {
      ...createField('cascader'),
      options: [
        { label: 'Province', value: 'province', children: [{ label: 'City', value: 'city' }] },
      ],
    }
    expect(validateValues([field], { cascader_1: ['province'] }).errors.cascader_1).toBeDefined()
    expect(validateValues([field], { cascader_1: ['province', 'city'] })).toEqual({
      errors: {},
      data: { cascader_1: ['province', 'city'] },
    })
  })
  it('does not validate conditional required fields until they are visible', () => {
    const field = {
      ...createField('text'),
      required: true,
      rules: [{ field: 'trigger', operator: 'equals' as const, value: 'yes' }],
    }
    expect(validateValues([field], { trigger: 'no' })).toEqual({ errors: {}, data: {} })
    expect(validateValues([field], { trigger: 'yes' }).errors.text_1).toBeDefined()
  })
})
