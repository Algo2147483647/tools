import { createContext, useContext } from 'react';

export type StudioMode = 'graphs' | 'services';
export type ServiceEntry = { mode?: 'open' | 'create'; path?: string };
export const StudioNavigation = createContext<{
  mode: StudioMode;
  openServices: (entry?: ServiceEntry) => void;
}>({ mode: 'graphs', openServices: () => {} });
export const useStudioNavigation = () => useContext(StudioNavigation);

export function readServiceRecents(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('service-atlas-recent') || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 8) : [];
  } catch { return []; }
}
