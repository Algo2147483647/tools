import legacyStarter from './compat/legacy-starter.json'
import { starterDocument, type FormDocument } from './model'

// Ignore generated IDs and object key order, but compare every authored value.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'id')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    )
  }
  return value
}

const legacySignature = JSON.stringify(canonical({ ...legacyStarter, labelLayout: 'stacked' }))

export function upgradeStarter(doc: FormDocument): FormDocument {
  if (JSON.stringify(canonical(doc)) !== legacySignature) return doc
  const next = starterDocument()
  next.fields.forEach((field, index) => {
    field.id = doc.fields[index].id
  })
  return next
}
