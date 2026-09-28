import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDocument, flatten } from './model'

const data = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
})
const { useStudio } = await import('./store')
const state = () => useStudio.getState()
beforeEach(() => {
  data.clear()
  useStudio.setState({
    doc: emptyDocument(),
    selected: null,
    past: [],
    future: [],
    lastEdit: '',
    lastEditTime: 0,
    saveError: null,
  })
})

describe('Designer state transactions', () => {
  it('moves between nested containers and prevents a parent from entering its own subtree', () => {
    state().add('section')
    const section = state().selected!
    state().add('grid', section)
    const grid = state().selected!
    state().add('text')
    const text = state().selected!
    state().move(text, grid, 0)
    expect(state().doc.fields[0].children[0].children[0].id).toBe(text)
    const before = state().doc
    state().move(section, grid, 0)
    expect(state().doc).toEqual(before)
    state().move(text, null, 0)
    expect(state().doc.fields[0].id).toBe(text)
  })
  it('duplicates whole subtrees with unique names, IDs and internal conditions', () => {
    state().add('section')
    const section = state().selected!
    state().add('text', section)
    const control = state().selected!
    state().updateField(control, { name: 'trigger' })
    state().add('email', section)
    const dependent = state().selected!
    state().updateField(dependent, {
      rules: [{ field: 'trigger', operator: 'equals', value: 'yes' }],
    })
    state().duplicate(section)
    const all = flatten(state().doc.fields),
      copy = state().doc.fields[1]
    expect(new Set(all.map((field) => field.id)).size).toBe(all.length)
    expect(new Set(all.map((field) => field.name)).size).toBe(all.length)
    expect(copy.children[1].rules[0].field).toBe(copy.children[0].name)
  })
  it('updates condition references on rename and cleans them on deletion', () => {
    state().add('text')
    const controller = state().selected!
    state().add('email')
    const dependent = state().selected!
    state().updateField(dependent, {
      rules: [{ field: 'text_1', operator: 'equals', value: 'yes' }],
    })
    state().updateField(controller, { name: 'renamed' })
    expect(state().doc.fields[1].rules[0].field).toBe('renamed')
    state().remove(controller)
    expect(state().doc.fields[0].rules).toEqual([])
    state().undo()
    expect(state().doc.fields[1].rules[0].field).toBe('renamed')
  })
  it('restores deleted selections safely and persists undo/redo results', () => {
    state().add('text')
    const id = state().selected!
    state().remove(id)
    expect(state().selected).toBeNull()
    state().undo()
    expect(state().doc.fields).toHaveLength(1)
    state().redo()
    expect(state().doc.fields).toHaveLength(0)
    expect(JSON.parse(data.get('form-studio.document.v2')!).fields).toEqual([])
  })
  it('keeps the document intact on invalid edits and invalid replacement', () => {
    state().add('text')
    const before = state().doc
    expect(() => state().updateField(state().selected!, { name: '__proto__' })).toThrow()
    expect(state().doc).toEqual(before)
    expect(() => state().replace({ ...before, title: '' })).toThrow()
    expect(state().doc).toEqual(before)
  })
  it('starts a new history branch after undo and caps history size', () => {
    state().add('text')
    state().add('email')
    state().undo()
    state().add('number')
    expect(state().future).toHaveLength(0)
    for (let i = 0; i < 85; i++) state().add('text')
    expect(state().past).toHaveLength(80)
  })
})
