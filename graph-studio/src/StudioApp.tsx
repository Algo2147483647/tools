import { lazy, Suspense, useLayoutEffect, useState } from 'react';
import GraphApp from './App';
import { StudioNavigation, type ServiceEntry, type StudioMode } from './StudioNavigation';

const ServiceArchitecture = lazy(() => import('./serviceArchitecture/App'));

export default function StudioApp() {
  const [mode, setMode] = useState<StudioMode>(() =>
    new URLSearchParams(location.search).get('workspace') === 'services' ? 'services' : 'graphs');
  const [entry, setEntry] = useState<ServiceEntry>({});
  useLayoutEffect(() => {
    document.documentElement.dataset.studioMode = mode;
    document.title = mode === 'services' ? 'Service architecture · Graph Studio' : 'Graph Studio';
    const url = new URL(location.href);
    if (mode === 'services') url.searchParams.set('workspace', 'services');
    else url.searchParams.delete('workspace');
    history.replaceState(null, '', url);
  }, [mode]);
  function openServices(next: ServiceEntry = {}) {
    setEntry(next);
    setMode('services');
  }
  return <StudioNavigation.Provider value={{ mode, openServices }}>
    {/* Keep the graph session and undo history when visiting service workspaces. */}
    <div hidden={mode !== 'graphs'} style={{ height: '100%' }}><GraphApp /></div>
    {mode === 'services' && <Suspense fallback={<p role="status">Opening service architecture…</p>}>
      <ServiceArchitecture entry={entry} onHome={() => setMode('graphs')} />
    </Suspense>}
  </StudioNavigation.Provider>;
}
