import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Car,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crosshair,
  Expand,
  FlaskConical,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Route,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { createCity } from './engine/city';
import { SimulationEngine } from './engine/simulation';
import CityMap from './components/CityMap';
import BenchmarkPanel from './components/BenchmarkPanel';
import { useDialog } from './components/useDialog';
import { downloadText } from './download';
import {
  ALGORITHMS,
  type Algorithm,
  type LayerOptions,
  type MapHandle,
  type MapSelection,
  type ScoreWeights,
  type ViewMode,
} from './types';

const statusColors: Record<string, string> = {
  Idle: '#a9ec77',
  Pickup: '#f5c967',
  Serving: '#65c9ef',
  Repositioning: '#b5a0f2',
  Offline: '#71808a',
};
const initialLayers: LayerOptions = {
  drivers: true,
  orders: true,
  demand: true,
  supply: false,
  roads: true,
  dispatch: true,
  routes: true,
  zones: false,
};
const presets = [
  { name: 'Morning commute', hour: 8, demand: 1 },
  { name: 'Evening rush', hour: 17, demand: 2 },
  { name: 'After dark', hour: 22, demand: 1.5 },
  { name: 'Demand surge', hour: 12, demand: 5 },
];
const formatTime = (seconds: number, hour: number, detail = false) => {
  const s = (Math.floor(seconds) + hour * 3600) % 86400;
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, ...(detail ? [s % 60] : [])]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
};
function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [shown, setShown] = useState(value);
  const prior = useRef(value);
  useEffect(() => {
    const start = performance.now(),
      from = prior.current;
    let frame = 0;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / 350);
      const n = from + (value - from) * (1 - (1 - t) ** 3);
      prior.current = n;
      setShown(n);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      {prefix}
      {shown.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  );
}
function Sparkline({
  values,
  color = '#b9f778',
  fill = false,
  ceiling = 0,
}: {
  values: number[];
  color?: string;
  fill?: boolean;
  ceiling?: number;
}) {
  const v = values.length > 1 ? values : values.length ? [values[0], values[0]] : [0, 0];
  const max = Math.max(1, ceiling, ...v),
    min = Math.min(0, ...v);
  const points = v
    .map((n, i) => `${(i / (v.length - 1)) * 180},${39 - ((n - min) / (max - min || 1)) * 33}`)
    .join(' ');
  return (
    <svg viewBox="0 0 180 44" preserveAspectRatio="none" className="sparkline" aria-hidden="true">
      {fill && <polygon points={`0,44 ${points} 180,44`} fill={color} opacity=".08" />}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(): void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
function App() {
  const network = useMemo(() => createCity(), []);
  const engine = useMemo(() => new SimulationEngine(network), [network]);
  const [, refresh] = useState(0);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const [layers, setLayers] = useState<LayerOptions>(initialLayers);
  const [view, setView] = useState<ViewMode>('city');
  const [visualize, setVisualize] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(null);
  const [benchmark, setBenchmark] = useState(false);
  const [help, setHelp] = useState(false);
  const [fps, setFps] = useState(60);
  const [layersOpen, setLayersOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);
  const [toast, setToast] = useState('');
  const [preset, setPreset] = useState('Morning commute');
  const [weightsOpen, setWeightsOpen] = useState(false);
  useDialog(help, () => setHelp(false));
  const map = useRef<MapHandle>(null);
  const feed = useRef<HTMLDivElement>(null);
  const announce = (message: string) => setToast(message);
  const state = engine.state,
    { metrics: m, config } = state;
  const algo = ALGORITHMS.find((a) => a.id === config.algorithm)!;
  const newestEvent = state.events[0]?.id;
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = 0;
  }, [newestEvent]);
  const update = () => refresh((x) => x + 1);
  const play = () => {
    engine.setRunning(!engine.state.running);
    update();
  };
  const reset = () => {
    engine.reset();
    setSelection(null);
    update();
    announce('Scenario reset · same seed, fresh fleet');
  };
  const configure = (c: Parameters<SimulationEngine['setConfig']>[0]) => {
    engine.setConfig(c);
    update();
  };
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      accumulated = 0,
      lastRender = last;
    const loop = (now: number) => {
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (engine.state.running) {
        accumulated = Math.min(5, accumulated + elapsed * 10 * speedRef.current);
        while (accumulated >= 0.1) {
          engine.step(0.1);
          accumulated -= 0.1;
        }
      } else accumulated = 0;
      if (now - lastRender > 220) {
        refresh((x) => x + 1);
        lastRender = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) ||
          e.target.isContentEditable)
      )
        return;
      if (e.code === 'Escape') {
        setSelection(null);
        setBenchmark(false);
        setHelp(false);
        setLayersOpen(false);
      }
      if (benchmark || help) return;
      if (e.code === 'Space') {
        e.preventDefault();
        engine.setRunning(!engine.state.running);
        refresh((x) => x + 1);
      }
      if (e.code === 'KeyR') {
        engine.reset();
        setSelection(null);
        refresh((x) => x + 1);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [engine, benchmark, help]);
  const exportState = () => {
    const payload = {
      app: 'VECTOR',
      version: 1,
      exportedAt: new Date().toISOString(),
      config,
      time: state.time,
      metrics: m,
      history: state.history,
      vehicles: state.vehicles,
      orders: state.orders,
    };
    downloadText(
      `vector-snapshot-${formatTime(state.time, config.startHour).replace(':', '')}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    announce('Simulation snapshot exported');
  };
  const changePreset = (name: string) => {
    const p = presets.find((p) => p.name === name)!;
    setPreset(name);
    engine.reset({ startHour: p.hour, demand: p.demand });
    setSelection(null);
    update();
    announce(`${name} scenario loaded`);
  };
  const market = m.ratio > 1.2 ? 'Surplus' : m.ratio < 0.8 ? 'Shortage' : 'Balanced';
  const vehicle =
    selection?.type === 'vehicle' ? state.vehicles.find((v) => v.id === selection.id) : undefined;
  const order =
    selection?.type === 'order' ? state.orders.find((o) => o.id === selection.id) : undefined;
  const zone =
    selection?.type === 'zone' ? network.zones.find((z) => z.id === selection.id) : undefined;
  const zoneName = (id: string) => network.zones.find((z) => z.id === id)?.name ?? id;
  const hotspots = network.zones
    .map((z) => ({
      ...z,
      waiting: state.orders.filter(
        (o) => o.pickupZone === z.id && ['Waiting', 'Assigned', 'PickingUp'].includes(o.status),
      ).length,
      idle: state.vehicles.filter(
        (v) => v.status === 'Idle' && network.nodes[v.nodeId]?.zoneId === z.id,
      ).length,
    }))
    .sort((a, b) => b.waiting - a.waiting);
  const online = state.vehicles.filter((v) => v.status !== 'Offline').length;
  const legend = Object.entries(statusColors).filter(([status]) => status !== 'Offline');
  return (
    <main className="app-shell">
      <CityMap
        ref={map}
        network={network}
        state={state}
        layers={layers}
        view={view}
        visualize={visualize}
        selection={selection}
        onSelect={setSelection}
        onFps={setFps}
      />
      <div className="map-vignette" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Navigation size={22} strokeWidth={2.5} />
          </div>
          <div>
            <div className="brand-name">
              VECTOR<span>LAB</span>
            </div>
            <p>Ride Dispatch Simulator</p>
          </div>
        </div>
        <nav className="main-nav" aria-label="Workspace">
          <button className="active" onClick={() => setBenchmark(false)}>
            <Radio size={14} />
            Live operations
          </button>
          <button onClick={() => setBenchmark(true)}>
            <FlaskConical size={14} />
            Algorithm lab
            <ArrowUpRight size={12} />
          </button>
        </nav>
        <div className="header-actions">
          <span className="system-state">
            <span className={`status-dot ${state.running ? 'pulse' : ''}`} />
            {state.running ? 'SYSTEM LIVE' : state.time > 0 ? 'SYSTEM PAUSED' : 'SYSTEM READY'}
          </span>
          <button
            className="icon-button"
            title="Export simulation snapshot"
            aria-label="Export simulation snapshot"
            onClick={exportState}
          >
            <ArrowDownToLine size={16} />
          </button>
          <button
            className="icon-button"
            title="Simulation guide"
            aria-label="Simulation guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={17} />
          </button>
          <div className="avatar">VX</div>
        </div>
      </header>

      <section className="kpi-strip glass" aria-label="Live performance metrics">
        <div className="kpi">
          <div className="kpi-label">
            <Car size={13} />
            ACTIVE DRIVERS
            <span className="mini-dot" />
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={m.activeDrivers} />
            <span className="kpi-tag">ONLINE</span>
          </div>
          <div className="kpi-bottom">
            <span>
              <b className="lime">{m.idle}</b> available now
            </span>
            <div className="tiny-fleet">
              <i style={{ width: `${(m.idle / Math.max(1, online)) * 100}%` }} />
              <i style={{ width: `${(m.pickup / Math.max(1, online)) * 100}%` }} />
              <i style={{ width: `${(m.serving / Math.max(1, online)) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Users size={13} />
            WAITING ORDERS
          </div>
          <div className="kpi-value warm">
            <AnimatedNumber value={m.waitingOrders} />
            <Sparkline
              values={state.history.slice(-25).map((h) => h.waitingOrders)}
              color="#eec987"
            />
          </div>
          <div className="kpi-bottom">
            <span>Orders / min</span>
            <strong>
              <AnimatedNumber value={m.ordersPerMin} decimals={1} />
            </strong>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Clock3 size={13} />
            AVG PICKUP ETA
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={m.avgPickupETA / 60} decimals={1} />
            <small>min</small>
            <Sparkline
              values={state.history.slice(-25).map((h) => h.avgPickupETA)}
              color="#91c6de"
            />
          </div>
          <div className="kpi-bottom">
            <span>Pickup distance</span>
            <strong>
              <AnimatedNumber value={m.avgPickupDistance} decimals={2} /> km
            </strong>
          </div>
        </div>
        <div className="kpi">
          <div
            className="kpi-label"
            title="Mean time from request creation to pickup. Before the first pickup, shows the current open-request mean."
          >
            <Activity size={13} />
            PASSENGER WAIT
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={m.avgWait / 60} decimals={1} />
            <small>min</small>
          </div>
          <div className="kpi-bottom">
            <span>Cancellation rate</span>
            <strong>
              <AnimatedNumber value={m.cancellationRate} decimals={1} />%
            </strong>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Target size={13} />
            COMPLETION RATE
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={m.completionRate} decimals={1} />
            <small>%</small>
          </div>
          <div className="kpi-bottom">
            <span>Driver utilization</span>
            <strong className="lime">
              <AnimatedNumber value={m.utilization} decimals={1} />%
            </strong>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <TrendingUp size={13} />
            TOTAL REVENUE
          </div>
          <div className="kpi-value">
            <AnimatedNumber value={m.revenue} prefix="$" decimals={0} />
          </div>
          <div className="kpi-bottom">
            <span>{m.completed} trips completed</span>
            <span className="subtle">USD</span>
          </div>
        </div>
      </section>

      <div className="mobile-panel-buttons">
        <button onClick={() => setControlsOpen(!controlsOpen)}>
          <SlidersHorizontal size={14} />
          Controls
        </button>
        <button onClick={() => setFeedOpen(!feedOpen)}>
          <Activity size={14} />
          Activity
        </button>
      </div>
      <aside
        className={`left-panel glass ${controlsOpen ? '' : 'panel-hidden'}`}
        aria-label="Simulation controls"
      >
        <div className="panel-heading">
          <span>
            <SlidersHorizontal size={14} />
            Simulation control
          </span>
          <span className="panel-code">01 / CONFIG</span>
        </div>
        <div className="panel-scroll">
          <section className="control-section scenario-section">
            <div className="field-label">
              CITY SCENARIO<span>10 ZONES</span>
            </div>
            <div className="city-select">
              <div className="city-icon">
                <MapPin size={18} />
              </div>
              <div>
                <strong>New Harbor</strong>
                <span>Virtual city · connected road network</span>
              </div>
              <Check size={14} className="lime" />
            </div>
            <label className="sr-only" htmlFor="scenario">
              Demand scenario
            </label>
            <select id="scenario" value={preset} onChange={(e) => changePreset(e.target.value)}>
              {!preset && (
                <option value="" disabled>
                  Custom scenario
                </option>
              )}
              {presets.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </section>
          <section className="control-section">
            <div className="field-label">
              DISPATCH ENGINE
              <Zap size={12} className="lime" />
            </div>
            <label className="sr-only" htmlFor="algorithm">
              Dispatch algorithm
            </label>
            <div className="algorithm-select">
              <select
                id="algorithm"
                value={config.algorithm}
                onChange={(e) => {
                  configure({ algorithm: e.target.value as Algorithm });
                  announce(
                    `${ALGORITHMS.find((a) => a.id === e.target.value)?.name} enabled for new matches`,
                  );
                }}
              >
                {ALGORITHMS.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="field-description">{algo.description}</p>
            {config.algorithm === 'batch' && (
              <div className="algorithm-parameters">
                <span className="field-label">MATCHING INTERVAL</span>
                <div className="segments">
                  {[3, 5, 10].map((n) => (
                    <button
                      className={config.batchInterval === n ? 'active' : ''}
                      key={n}
                      onClick={() => configure({ batchInterval: n })}
                    >
                      {n}s
                    </button>
                  ))}
                </div>
              </div>
            )}
            {config.algorithm === 'score' && (
              <div className="algorithm-parameters">
                <button
                  className="text-button weights-trigger"
                  onClick={() => setWeightsOpen(!weightsOpen)}
                >
                  Scoring weights
                  <ChevronDown size={14} className={weightsOpen ? 'rotated' : ''} />
                </button>
                {weightsOpen &&
                  (Object.entries(config.weights) as [keyof ScoreWeights, number][]).map(
                    ([key, v]) => (
                      <label className="weight-control" key={key}>
                        <span>
                          {
                            {
                              distance: 'Pickup distance',
                              wait: 'Passenger waiting',
                              idle: 'Driver idle time',
                              balance: 'Zone scarcity',
                              fairness: 'Income fairness',
                            }[key]
                          }
                          <b>{v.toFixed(2)}</b>
                        </span>
                        <input
                          type="range"
                          aria-label={`${key} weight`}
                          min="0"
                          max="3"
                          step="0.01"
                          value={v}
                          onChange={(e) =>
                            configure({
                              weights: { ...config.weights, [key]: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
              </div>
            )}
            <div className="control-toggle">
              <span>
                <Sparkles size={13} />
                Visualize decisions
              </span>
              <Toggle
                label="Visualize algorithm decisions"
                checked={visualize}
                onChange={() => setVisualize(!visualize)}
              />
            </div>
          </section>
          <section className="control-section">
            <div className="field-label">
              DEMAND LEVEL
              <strong className="demand-value">
                {config.demand.toFixed(1)}
                <small>×</small>
              </strong>
            </div>
            <input
              className="demand-slider"
              type="range"
              aria-label="Demand level"
              min="0.5"
              max="5"
              step="0.5"
              value={config.demand}
              style={
                {
                  '--range-progress': `${((config.demand - 0.5) / 4.5) * 100}%`,
                } as React.CSSProperties
              }
              onChange={(e) => {
                configure({ demand: Number(e.target.value) });
                setPreset('');
              }}
            />
            <div className="range-labels">
              <span>0.5×</span>
              <span>1×</span>
              <span>2×</span>
              <span>3×</span>
              <span>5×</span>
            </div>
            <p className="field-description">
              ~{Math.round(20 * config.demand)} requests / simulated minute
            </p>
            <div className="field-label supply-label">
              DRIVER SUPPLY
              <span>
                <Car size={12} /> {config.supply} VEHICLES
              </span>
            </div>
            <div className="segments supply-segments">
              {[50, 100, 200, 500, 1000].map((n) => (
                <button
                  key={n}
                  className={config.supply === n ? 'active' : ''}
                  onClick={() => configure({ supply: n })}
                >
                  {n === 1000 ? '1k' : n}
                </button>
              ))}
            </div>
            <div className="control-toggle reposition">
              <span>Proactive repositioning</span>
              <Toggle
                label="Proactive repositioning"
                checked={config.reposition}
                onChange={() => configure({ reposition: !config.reposition })}
              />
            </div>
          </section>
          <section className="control-section layer-section">
            <button
              className="layer-trigger"
              onClick={() => setLayersOpen(!layersOpen)}
              aria-expanded={layersOpen}
            >
              <span>
                <Layers size={14} />
                Map layers
              </span>
              <span className="layer-count">
                {Object.values(layers).filter(Boolean).length} active
                <ChevronDown size={14} className={layersOpen ? 'rotated' : ''} />
              </span>
            </button>
            {layersOpen && (
              <div className="layer-options">
                {(Object.keys(initialLayers) as (keyof LayerOptions)[]).map((key) => (
                  <label key={key}>
                    <span>
                      {
                        {
                          drivers: 'Drivers',
                          orders: 'Passenger orders',
                          demand: 'Demand heatmap',
                          supply: 'Supply heatmap',
                          roads: 'Road network',
                          dispatch: 'Dispatch connections',
                          routes: 'Active routes',
                          zones: 'Demand zones',
                        }[key]
                      }
                    </span>
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() => setLayers({ ...layers, [key]: !layers[key] })}
                    />
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>
        <button className="benchmark-launch" onClick={() => setBenchmark(true)}>
          <FlaskConical size={16} />
          <div>
            <strong>Compare algorithms</strong>
            <span>One scenario. Six perspectives.</span>
          </div>
          <ArrowUpRight size={16} />
        </button>
      </aside>

      <div className="map-context">
        <div className="map-location">
          <span className="status-dot" />
          <strong>NEW HARBOR</strong>
          <span>URBAN MOBILITY NETWORK</span>
        </div>
        <div className="view-switch" aria-label="Map perspective">
          {(['city', 'demand', 'supply'] as ViewMode[]).map((v) => (
            <button
              key={v}
              className={view === v ? 'active' : ''}
              onClick={() => {
                setView(v);
                if (v !== 'city') setLayers((l) => ({ ...l, [v]: true }));
              }}
            >
              {v === 'city' ? 'City view' : v === 'demand' ? 'Demand' : 'Supply'}
            </button>
          ))}
        </div>
      </div>
      <div className="map-tools glass">
        <button
          className="icon-button"
          onClick={() => map.current?.zoomIn()}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => map.current?.zoomOut()}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={18} />
        </button>
        <span />
        <button
          className="icon-button"
          onClick={() => map.current?.reset()}
          aria-label="Reset map view"
          title="Reset map view"
        >
          <Crosshair size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Toggle fullscreen"
          title="Toggle fullscreen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void document.documentElement
                .requestFullscreen()
                .catch(() => announce('Fullscreen is unavailable in this window'));
          }}
        >
          <Expand size={16} />
        </button>
      </div>

      <aside
        className={`right-panels ${feedOpen ? '' : 'panel-hidden'}`}
        aria-label="Live dispatch activity"
      >
        <section className="balance-panel glass">
          <div className="panel-heading">
            <span>Supply & demand</span>
            <span className={`market-tag ${market.toLowerCase()}`}>
              <span />
              {market}
            </span>
          </div>
          <div className="balance-values">
            <div>
              <span>AVAILABLE</span>
              <strong>
                <AnimatedNumber value={m.supply} />
              </strong>
              <small>drivers</small>
            </div>
            <i>/</i>
            <div>
              <span>OPEN DEMAND</span>
              <strong className="warm">
                <AnimatedNumber value={m.demand} />
              </strong>
              <small>requests</small>
            </div>
            <div className="ratio-number">
              <span>S/D RATIO</span>
              <strong>{Math.min(99.9, m.ratio).toFixed(2)}</strong>
              <small>{m.ratio > 99.9 ? '> 99.9×' : 'available / open'}</small>
            </div>
          </div>
          <div className="balance-chart">
            <div className="chart-guide" />
            <Sparkline
              values={state.history.slice(-60).map((h) => h.supply)}
              ceiling={Math.max(
                1,
                ...state.history.slice(-60).flatMap((h) => [h.supply, h.demand]),
              )}
              fill
            />
            <Sparkline
              values={state.history.slice(-60).map((h) => h.demand)}
              ceiling={Math.max(
                1,
                ...state.history.slice(-60).flatMap((h) => [h.supply, h.demand]),
              )}
              color="#efbc80"
              fill
            />
          </div>
          <div className="chart-key">
            <span>
              <i className="lime-bg" />
              Supply
            </span>
            <span>
              <i className="warm-bg" />
              Demand
            </span>
            <small>RECENT TREND</small>
          </div>
        </section>
        <section className="feed-panel glass">
          <div className="panel-heading">
            <span>
              <span className={`status-dot ${state.running ? 'pulse' : ''}`} />
              Live dispatch feed
            </span>
            <span className="live-tag">{state.running ? 'LIVE' : 'PAUSED'}</span>
          </div>
          <div ref={feed} className="feed-list" aria-label="Recent dispatch events">
            {state.events.slice(0, 8).map((e) => (
              <div className={`feed-event event-${e.kind}`} key={e.id}>
                <div className="event-icon">
                  {e.kind === 'created' ? (
                    <Plus size={12} />
                  ) : e.kind === 'assigned' ? (
                    <ArrowRight size={12} />
                  ) : e.kind === 'completed' ? (
                    <Check size={12} />
                  ) : e.kind === 'cancelled' ? (
                    <X size={12} />
                  ) : e.kind === 'pickup' ? (
                    <Car size={12} />
                  ) : (
                    <Radio size={12} />
                  )}
                </div>
                <div>
                  <p>{e.message}</p>
                  <span>
                    {formatTime(e.time, config.startHour, true)}
                    <small>{e.kind === 'assigned' ? 'DISPATCH' : e.kind.toUpperCase()}</small>
                  </span>
                </div>
              </div>
            ))}
            {!state.events.length && (
              <div className="feed-empty">
                <Radio size={20} />
                <p>Listening for city activity</p>
                <span>Start the simulation to follow dispatches.</span>
              </div>
            )}
          </div>
          <div className="feed-footer">
            <span className="mini-dot" />
            {algo.label}
            <span>{m.created} requests</span>
          </div>
        </section>
        <section className="hotspot-panel glass">
          <div className="panel-heading">
            <span>
              <MapPin size={13} />
              Demand hotspots
            </span>
            <span className="panel-code">OPEN</span>
          </div>
          <div className="hotspot-list">
            {hotspots.slice(0, 3).map((z, i) => (
              <button
                key={z.id}
                onClick={() => {
                  setSelection({ type: 'zone', id: z.id });
                  map.current?.focusZone(z.id);
                }}
              >
                <span className="hotspot-rank">0{i + 1}</span>
                <div>
                  <span>{z.name}</span>
                  <div className="hotspot-track">
                    <i
                      style={{
                        width: `${Math.max(8, (z.waiting / Math.max(1, hotspots[0].waiting)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <strong>
                  {z.waiting}
                  <ArrowUpRight size={11} />
                </strong>
              </button>
            ))}
          </div>
        </section>
      </aside>

      {(vehicle || order || zone) && (
        <section className="detail-card glass" aria-label="Map selection details">
          <div className="panel-heading">
            <span>
              {vehicle ? <Car size={15} /> : <MapPin size={15} />}
              {vehicle
                ? `Driver #${String(vehicle.id).padStart(3, '0')}`
                : order
                  ? `Order #${order.id}`
                  : zone!.name}
            </span>
            <button
              className="icon-button"
              aria-label="Close details"
              onClick={() => setSelection(null)}
            >
              <X size={15} />
            </button>
          </div>
          {vehicle && (
            <>
              <div className="detail-status" style={{ color: statusColors[vehicle.status] }}>
                <span className="status-dot" />
                {vehicle.status}
                <span>LIVE TELEMETRY</span>
              </div>
              <dl>
                <dt>Current speed</dt>
                <dd>{vehicle.speed.toFixed(0)} km/h</dd>
                <dt>Current order</dt>
                <dd>{vehicle.orderId !== null ? `#${vehicle.orderId}` : 'No active trip'}</dd>
                <dt>Daily revenue</dt>
                <dd>${vehicle.revenue.toFixed(2)}</dd>
                <dt>Completed trips</dt>
                <dd>{vehicle.completed}</dd>
                <dt>Utilization</dt>
                <dd>
                  {((vehicle.servingTime / Math.max(1, vehicle.onlineTime)) * 100).toFixed(1)}%
                </dd>
                <dt>Idle time</dt>
                <dd>{(vehicle.idleTime / 60).toFixed(1)} min</dd>
                <dt>Distance driven</dt>
                <dd>{vehicle.distanceDriven.toFixed(2)} km</dd>
                <dt>Current road</dt>
                <dd>
                  {network.edges.find((e) => e.id === vehicle.edgeId)?.name ??
                    `Junction ${vehicle.nodeId}`}
                </dd>
              </dl>
            </>
          )}
          {order && (
            <>
              <div className="detail-status warm">
                <span className="status-dot" />
                {order.status}
                <span>PASSENGER REQUEST</span>
              </div>
              <div className="trip-locations">
                <div>
                  <i />
                  <span>{zoneName(order.pickupZone)}</span>
                </div>
                <div>
                  <i />
                  <span>{zoneName(order.destinationZone)}</span>
                </div>
              </div>
              <dl>
                <dt>Waiting time</dt>
                <dd>{(order.waitTime / 60).toFixed(1)} min</dd>
                <dt>Trip distance</dt>
                <dd>{order.estimatedDistance.toFixed(2)} km</dd>
                <dt>Estimated fare</dt>
                <dd>${order.fare.toFixed(2)}</dd>
                <dt>Assigned driver</dt>
                <dd>
                  {order.assignedVehicle !== null
                    ? `#${order.assignedVehicle}`
                    : 'Awaiting dispatch'}
                </dd>
                <dt>Pickup ETA</dt>
                <dd>
                  {order.assignedVehicle === null
                    ? '—'
                    : `${Math.max(0, (order.pickupETA - (state.time - (order.assignedTime ?? state.time))) / 60).toFixed(1)} min`}
                </dd>
              </dl>
            </>
          )}
          {zone && (
            <>
              <div className="detail-status lime">
                <span className="status-dot" />
                {zone.kind.replace('cbd', 'Central business district')}
                <span>DEMAND ZONE</span>
              </div>
              <dl>
                <dt>Base demand weight</dt>
                <dd>{zone.weight.toFixed(1)}</dd>
                <dt>Open requests</dt>
                <dd>{hotspots.find((z) => z.id === zone.id)?.waiting}</dd>
                <dt>Idle drivers</dt>
                <dd>{hotspots.find((z) => z.id === zone.id)?.idle}</dd>
                <dt>Service radius</dt>
                <dd>{(zone.radius * 0.008).toFixed(1)} km</dd>
              </dl>
              <p className="detail-note">
                Demand changes with the simulation clock. Residential origins peak in the morning;
                downtown peaks in the evening.
              </p>
            </>
          )}
        </section>
      )}

      <div className="map-bottom">
        <div className="vehicle-legend glass">
          {legend.map(([label, color]) => (
            <span key={label}>
              <i style={{ background: color, boxShadow: `0 0 6px ${color}50` }} />
              {label}
            </span>
          ))}
          <span className="legend-divider" />
          <span>
            <i className="order-dot" />
            Order
          </span>
        </div>
        <div className="map-attribution">
          <span>NEW HARBOR · SYNTHETIC CITY</span>
          <span>Drag to pan · Scroll to zoom · Click to inspect</span>
        </div>
      </div>
      {!state.running && state.time === 0 && (
        <div className="start-prompt">
          <div className="start-prompt-icon">
            <Route size={19} />
          </div>
          <div>
            <strong>A city of possibilities. Ready to move.</strong>
            <span>{config.supply} drivers · 30 initial requests · 10 demand zones</span>
          </div>
          <button className="primary-button" onClick={play}>
            <Play size={13} fill="currentColor" />
            Start simulation
          </button>
        </div>
      )}

      <footer className="timeline glass">
        <div className="playback">
          <button
            className={`play-button ${state.running ? 'running' : ''}`}
            onClick={play}
            aria-label={state.running ? 'Pause simulation' : 'Start simulation'}
            title="Space to play / pause"
          >
            {state.running ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button reset-button"
            onClick={reset}
            aria-label="Reset simulation"
            title="Reset simulation (R)"
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <div className="simulation-clock">
          <span>SIMULATION TIME</span>
          <strong>
            {formatTime(state.time, config.startHour)}
            <small>:{String(Math.floor(state.time) % 60).padStart(2, '0')}</small>
          </strong>
        </div>
        <div className="timeline-scrubber">
          <div className="timeline-label">
            <span>
              <span className="mini-dot" />
              {state.running
                ? 'Simulation running'
                : state.time > 0
                  ? 'Simulation paused'
                  : 'Ready when you are'}
            </span>
            <span>
              {Math.floor(state.time / 60)}m elapsed · day{' '}
              {1 + Math.floor((config.startHour * 3600 + state.time) / 86400)}
            </span>
          </div>
          <input
            type="range"
            aria-label="Restart scenario at selected hour"
            title="Restart the scenario at a different time of day"
            min="0"
            max="23"
            step="1"
            value={Math.floor((state.time / 3600 + config.startHour) % 24)}
            onChange={(e) => {
              const hour = Number(e.target.value);
              engine.seekHour(hour);
              setPreset('');
              setSelection(null);
              update();
              announce(`Scenario restarted at ${String(hour).padStart(2, '0')}:00`);
            }}
          />
          <div className="timeline-hours">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>23:00</span>
          </div>
        </div>
        <div className="speed-control">
          <span>PLAYBACK SPEED</span>
          <div className="segments">
            {[1, 2, 5, 10].map((n) => (
              <button key={n} className={speed === n ? 'active' : ''} onClick={() => setSpeed(n)}>
                {n}×
              </button>
            ))}
          </div>
          <small>1× = 10 simulated seconds / sec</small>
        </div>
        <div className="engine-status">
          <span className="status-dot" />
          <div>
            <strong>ENGINE HEALTHY</strong>
            <span>
              {fps} FPS <i />
              100 ms tick
            </span>
          </div>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={14} />
          {toast}
        </div>
      )}
      {benchmark && <BenchmarkPanel config={config} onClose={() => setBenchmark(false)} />}
      {help && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setHelp(false);
          }}
        >
          <section
            className="guide modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
          >
            <header className="modal-header">
              <div>
                <div className="eyebrow lime">VECTOR / FIELD GUIDE</div>
                <h2 id="guide-title">Explore the art of dispatch.</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close guide"
                onClick={() => setHelp(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="guide-body">
              <div>
                <span>01</span>
                <section>
                  <h3>Set the city in motion</h3>
                  <p>
                    Start with 200 drivers, 30 requests, and 10 districts. Play at 1×–10×. The base
                    playback compresses 10 simulated seconds into one real second. Pause freezes the
                    engine; reset reproduces the seed.
                  </p>
                </section>
              </div>
              <div>
                <span>02</span>
                <section>
                  <h3>Make a different decision</h3>
                  <p>
                    Switch engines while the city runs. New matches use the selected algorithm;
                    existing trips continue. Batch Matching waits 3, 5, or 10 simulated seconds.
                    Score Based exposes five adjustable cost weights.
                  </p>
                </section>
              </div>
              <div>
                <span>03</span>
                <section>
                  <h3>Read the city</h3>
                  <p>
                    Drag to pan, scroll to zoom, and click drivers, passengers, or district labels
                    to inspect them. Demand and supply views show density; decision visualization
                    reveals candidate and selected assignments. Hotspot rows focus a district.
                  </p>
                </section>
              </div>
              <div>
                <span>04</span>
                <section>
                  <h3>Run a fair experiment</h3>
                  <p>
                    The Algorithm Lab replays the same seeded fleet and arrivals in independent
                    simulations. Compare seven real outcomes and export results. Completion is
                    completed / created; utilization is occupied / online driver time. Pickup ETA
                    measures assignment-time estimates; waiting time averages picked-up passengers,
                    falling back to current waiting passengers before the first pickup.
                  </p>
                </section>
              </div>
              <div className="guide-caveat">
                <Settings2 size={16} />
                <p>
                  A synthetic research environment: bidirectional roads, fixed road speeds, finite
                  passenger patience, and time-dependent zone probabilities. It does not model
                  traffic signals, congestion feedback, or real-world geographic data. Currency is
                  illustrative USD.
                </p>
              </div>
              <div className="shortcut-row">
                <span>
                  <kbd>Space</kbd> Play / pause
                </span>
                <span>
                  <kbd>R</kbd> Reset
                </span>
                <span>
                  <kbd>Esc</kbd> Close panel
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export default App;
