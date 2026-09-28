import { create } from 'zustand'
import { z } from 'zod'

const key = 'form-studio.preferences.v1'
const preferencesSchema = z.object({
  defaultLabelLayout: z.enum(['stacked', 'inline']).default('stacked'),
  glass: z.enum(['clear', 'frosted']).default('clear'),
  canvasGrid: z.boolean().default(true),
})
type Preferences = z.infer<typeof preferencesSchema>

function load(): Preferences {
  try {
    return preferencesSchema.parse(JSON.parse(localStorage.getItem(key) || '{}'))
  } catch {
    return preferencesSchema.parse({})
  }
}

export const usePreferences = create<
  Preferences & {
    error: string | null
    update: (patch: Partial<Preferences>) => void
  }
>((set, get) => ({
  ...load(),
  error: null,
  update: (patch) => {
    const next = preferencesSchema.parse({ ...get(), ...patch })
    let error: string | null = null
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      error = 'Preferences apply for this session only. Browser storage is unavailable.'
    }
    set({ ...next, error })
  },
}))
