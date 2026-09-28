import { useSyncExternalStore } from 'react'

export const settingsSections = [
  'layout',
  'details',
  'appearance',
  'workspace',
  'shortcuts',
] as const
export type SettingsSection = (typeof settingsSections)[number]

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function currentSection(): SettingsSection | null {
  const path = window.location.hash.slice(1).split('/')
  if (path[1] !== 'settings') return null
  return settingsSections.includes(path[2] as SettingsSection)
    ? (path[2] as SettingsSection)
    : 'layout'
}

export function useSettingsRoute() {
  return useSyncExternalStore(subscribe, currentSection, () => null)
}

export const settingsHref = (section: SettingsSection) => `#/settings/${section}`
