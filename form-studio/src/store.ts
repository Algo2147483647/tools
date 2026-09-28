import { create } from 'zustand'
import {
  createField,
  findField,
  flatten,
  isContainer,
  starterDocument,
  uid,
  type Field,
  type FieldType,
  type FormDocument,
} from './model'
import { parseDocument } from './schema'
import { upgradeStarter } from './starter-upgrade'
import { usePreferences } from './preferences'

const STORAGE_KEY = 'form-studio.document.v2'
const clone = <T>(value: T): T => structuredClone(value)
function load(): { doc: FormDocument; saveError: string | null } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const original = saved
      ? parseDocument(JSON.parse(saved))
      : {
          ...starterDocument(),
          labelLayout: usePreferences.getState().defaultLabelLayout,
        }
    const doc = upgradeStarter(original)
    return { doc, saveError: doc !== original ? save(doc) : null }
  } catch {
    return {
      doc: starterDocument(),
      saveError:
        'Could not load the local draft. A sample is shown; editing it will save a new draft.',
    }
  }
}
function detach(fields: Field[], id: string): Field[] {
  return fields
    .filter((field) => field.id !== id)
    .map((field) => ({ ...field, children: detach(field.children, id) }))
}
function listAt(fields: Field[], parent: string | null) {
  return parent ? findField(fields, parent)?.children : fields
}
function parentOf(
  fields: Field[],
  id: string,
  parent: string | null = null,
): string | null | undefined {
  for (const field of fields) {
    if (field.id === id) return parent
    const result = parentOf(field.children, id, field.id)
    if (result !== undefined) return result
  }
}
interface StudioState {
  doc: FormDocument
  selected: string | null
  past: FormDocument[]
  future: FormDocument[]
  saveError: string | null
  savedAt: number
  lastEdit: string
  lastEditTime: number
  select: (id: string | null) => void
  commit: (doc: FormDocument, key?: string) => void
  updateDocument: (patch: Partial<Omit<FormDocument, 'fields' | 'version'>>) => void
  updateField: (id: string, patch: Partial<Field>) => void
  add: (type: FieldType, parent?: string | null, index?: number) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  move: (id: string, parent: string | null, index: number) => void
  nudge: (id: string, direction: -1 | 1) => void
  replace: (doc: FormDocument) => void
  undo: () => void
  redo: () => void
}
function save(doc: FormDocument) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    return null
  } catch {
    return 'Autosave failed. Browser storage is unavailable or full. Export a backup.'
  }
}
export const useStudio = create<StudioState>((set, get) => ({
  ...load(),
  selected: null,
  past: [],
  future: [],
  savedAt: Date.now(),
  lastEdit: '',
  lastEditTime: 0,
  select: (selected) => set({ selected }),
  commit: (candidate, key = '') => {
    const doc = parseDocument(candidate)
    const state = get()
    if (JSON.stringify(doc) === JSON.stringify(state.doc)) return
    const grouped = key && key === state.lastEdit && Date.now() - state.lastEditTime < 650
    set({
      doc,
      past: grouped ? state.past : [...state.past, state.doc].slice(-80),
      future: [],
      saveError: save(doc),
      savedAt: Date.now(),
      lastEdit: key,
      lastEditTime: Date.now(),
    })
  },
  updateDocument: (patch) =>
    get().commit({ ...get().doc, ...patch }, `form:${Object.keys(patch).join()}`),
  updateField: (id, patch) => {
    const doc = clone(get().doc),
      field = findField(doc.fields, id)
    if (!field) return
    const oldName = field.name
    Object.assign(field, patch)
    if (patch.name && patch.name !== oldName)
      for (const item of flatten(doc.fields))
        for (const rule of item.rules) if (rule.field === oldName) rule.field = patch.name
    get().commit(doc, `${id}:${Object.keys(patch).join()}`)
  },
  add: (type, parent = null, index) => {
    const doc = clone(get().doc)
    if (parent && !isContainer(findField(doc.fields, parent)?.type ?? 'text')) return
    const field = createField(type, doc.fields),
      list = listAt(doc.fields, parent)
    if (!list) return
    list.splice(index ?? list.length, 0, field)
    get().commit(doc)
    set({ selected: field.id })
  },
  remove: (id) => {
    const state = get(),
      field = findField(state.doc.fields, id)
    if (!field) return
    const names = new Set(flatten([field]).map((item) => item.name))
    const doc = { ...clone(state.doc), fields: detach(state.doc.fields, id) }
    for (const item of flatten(doc.fields))
      item.rules = item.rules.filter((rule) => !names.has(rule.field))
    get().commit(doc)
    if (!findField(doc.fields, state.selected ?? '')) set({ selected: null })
  },
  duplicate: (id) => {
    const doc = clone(get().doc),
      field = findField(doc.fields, id)
    if (!field) return
    const copy = clone(field),
      names = new Set(flatten(doc.fields).map((item) => item.name)),
      mapping = new Map<string, string>()
    for (const item of flatten([copy])) {
      let name = `${item.name}_copy`,
        index = 2
      while (names.has(name)) name = `${item.name}_copy_${index++}`
      names.add(name)
      mapping.set(item.name, name)
      item.name = name
      item.id = uid()
    }
    copy.title += ' (copy)'
    for (const item of flatten([copy]))
      item.rules = item.rules.map((rule) => ({
        ...rule,
        field: mapping.get(rule.field) ?? rule.field,
      }))
    const list = listAt(doc.fields, parentOf(doc.fields, id) ?? null)!
    list.splice(list.findIndex((item) => item.id === id) + 1, 0, copy)
    get().commit(doc)
    set({ selected: copy.id })
  },
  move: (id, parent, index) => {
    const state = get(),
      field = findField(state.doc.fields, id)
    if (
      !field ||
      (parent &&
        (flatten([field]).some((item) => item.id === parent) ||
          !isContainer(findField(state.doc.fields, parent)?.type ?? 'text')))
    )
      return
    const doc = clone(state.doc)
    doc.fields = detach(doc.fields, id)
    const list = listAt(doc.fields, parent)
    if (!list) return
    list.splice(Math.max(0, Math.min(index, list.length)), 0, clone(field))
    get().commit(doc)
  },
  nudge: (id, direction) => {
    const fields = get().doc.fields,
      parent = parentOf(fields, id)
    if (parent === undefined) return
    const list = listAt(fields, parent)!,
      index = list.findIndex((field) => field.id === id),
      target = index + direction
    if (target >= 0 && target < list.length) get().move(id, parent, target)
  },
  replace: (doc) => {
    get().commit(doc)
    set({ selected: null })
  },
  undo: () => {
    const state = get(),
      doc = state.past.at(-1)
    if (doc)
      set({
        doc,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selected: findField(doc.fields, state.selected ?? '') ? state.selected : null,
        saveError: save(doc),
        savedAt: Date.now(),
        lastEdit: '',
      })
  },
  redo: () => {
    const state = get(),
      doc = state.future[0]
    if (doc)
      set({
        doc,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        selected: findField(doc.fields, state.selected ?? '') ? state.selected : null,
        saveError: save(doc),
        savedAt: Date.now(),
        lastEdit: '',
      })
  },
}))
