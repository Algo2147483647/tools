import { describe, expect, it } from 'vitest'
import legacyStarter from './compat/legacy-starter.json'
import { starterDocument } from './model'
import { parseDocument } from './schema'
import { upgradeStarter } from './starter-upgrade'

describe('English starter upgrade', () => {
  it('upgrades the untouched bundled example and preserves field IDs', () => {
    const original = parseDocument(legacyStarter)
    const next = upgradeStarter(original)
    expect(next.title).toBe(starterDocument().title)
    expect(next.accent).toBe('#176be8')
    expect(next.fields.map((field) => field.id)).toEqual(original.fields.map((field) => field.id))
    expect(JSON.stringify(next)).not.toMatch(/\p{Script=Han}/u)
  })

  it('preserves customized content, validation, order and appearance', () => {
    for (const change of [
      (doc: ReturnType<typeof parseDocument>) => {
        doc.title += ' custom'
      },
      (doc: ReturnType<typeof parseDocument>) => {
        doc.fields[0].placeholder = 'Custom prompt'
      },
      (doc: ReturnType<typeof parseDocument>) => {
        doc.fields[0].required = false
      },
      (doc: ReturnType<typeof parseDocument>) => {
        doc.fields.reverse()
      },
      (doc: ReturnType<typeof parseDocument>) => {
        doc.accent = '#123456'
      },
    ]) {
      const doc = parseDocument(legacyStarter)
      change(doc)
      expect(upgradeStarter(doc)).toBe(doc)
    }
  })

  it('does not change new English documents', () => {
    const doc = starterDocument()
    expect(upgradeStarter(doc)).toBe(doc)
  })
})
