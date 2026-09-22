export const themes = [
  { id: 'ocean', name: 'Ocean', color: '#215fca' },
  { id: 'violet', name: 'Violet', color: '#6b32c8' },
  { id: 'amber', name: 'Amber', color: '#9e590a' },
  { id: 'rose', name: 'Rose', color: '#b52651' },
  { id: 'slate', name: 'Slate', color: '#58687e' },
  { id: 'emerald', name: 'Emerald', color: '#267e60' },
] as const;

export type ThemeId = (typeof themes)[number]['id'];
export const themeStorageKey = 'service-atlas-theme';

export function readTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    return themes.find((theme) => theme.id === saved)?.id ?? 'ocean';
  } catch {
    return 'ocean';
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function saveTheme(theme: ThemeId) {
  applyTheme(theme);
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The selected theme remains active when browser storage is unavailable.
  }
}
