import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  FlaskConical,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { ALGORITHMS, type Metrics, type SimulationConfig } from '../types';
import type { BenchmarkResult } from '../engine/benchmark';
import { useDialog } from './useDialog';
import { downloadText } from '../download';

type MetricKey =
  | 'avgPickupETA'
  | 'avgWait'
  | 'avgPickupDistance'
  | 'completionRate'
  | 'utilization'
  | 'incomeVariance'
  | 'cancellationRate';
const fields: { key: MetricKey; name: string; unit: string; higher?: boolean }[] = [
  { key: 'avgPickupETA', name: 'Pickup ETA', unit: 'min' },
  { key: 'avgWait', name: 'Passenger wait', unit: 'min' },
  { key: 'avgPickupDistance', name: 'Pickup distance', unit: 'km' },
  { key: 'completionRate', name: 'Completion rate', unit: '%', higher: true },
  { key: 'utilization', name: 'Driver utilization', unit: '%', higher: true },
  { key: 'incomeVariance', name: 'Income variance', unit: '$²' },
  { key: 'cancellationRate', name: 'Cancellation rate', unit: '%' },
];
const colors = ['#baf777', '#65c9ed', '#bca3ff', '#fac777', '#f99f94', '#7de2c2'];
function value(m: Metrics, k: MetricKey) {
  return ['avgPickupETA', 'avgWait'].includes(k) ? m[k] / 60 : m[k];
}
export default function BenchmarkPanel({
  config,
  onClose,
}: {
  config: SimulationConfig;
  onClose(): void;
}) {
  useDialog(true, onClose);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(30);
  const [seed, setSeed] = useState(config.seed);
  const [metric, setMetric] = useState<MetricKey>('avgPickupETA');
  const [error, setError] = useState('');
  const [runSettings, setRunSettings] = useState({ ...config, duration: 30 });
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const run = () => {
    worker.current?.terminate();
    setResults([]);
    setError('');
    setRunning(true);
    setRunSettings({ ...config, seed, duration });
    const w = new Worker(new URL('../engine/benchmark.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') setResults((prev) => [...prev, data.result]);
      if (data.type === 'complete') {
        setResults(data.results);
        setRunning(false);
        w.terminate();
      }
      if (data.type === 'error') {
        setError(data.message);
        setRunning(false);
        w.terminate();
      }
    };
    w.onerror = (e) => {
      setError(e.message || 'The experiment could not finish. Please retry.');
      setRunning(false);
      w.terminate();
    };
    w.postMessage({ type: 'run', options: { ...config, seed, duration: duration * 60 } });
  };
  const stop = () => {
    worker.current?.terminate();
    setRunning(false);
  };
  const selected = fields.find((f) => f.key === metric)!;
  const max = Math.max(1, ...results.map((r) => value(r.metrics, metric)));
  const best = results.length
    ? (selected.higher ? Math.max : Math.min)(...results.map((r) => value(r.metrics, metric)))
    : 0;
  const exportCsv = () => {
    const content = [
      'Algorithm,Seed,Duration (min),Drivers,Demand multiplier,Start hour,Batch interval (s),Repositioning,' +
        fields.map((f) => `${f.name} (${f.unit})`).join(','),
      ...results.map((r) =>
        [
          r.name,
          runSettings.seed,
          runSettings.duration,
          runSettings.supply,
          runSettings.demand,
          runSettings.startHour,
          runSettings.batchInterval,
          runSettings.reposition,
          ...fields.map((f) => value(r.metrics, f.key).toFixed(3)),
        ].join(','),
      ),
    ].join('\n');
    downloadText(
      `vector-benchmark-seed-${runSettings.seed}.csv`,
      content,
      'text/csv;charset=utf-8',
    );
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="benchmark modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="benchmark-title"
      >
        <header className="modal-header">
          <div>
            <div className="eyebrow lime">
              <FlaskConical size={13} /> THE ALGORITHM LAB
            </div>
            <h2 id="benchmark-title">Same city. Different decisions.</h2>
            <p>Replay an identical demand stream across six dispatch engines.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close benchmark">
            <X size={20} />
          </button>
        </header>
        <div className="experiment-setup">
          <label>
            RANDOM SEED
            <input
              type="number"
              value={seed}
              disabled={running}
              min={1}
              max={999999}
              onChange={(e) => setSeed(Math.max(1, Math.min(999999, Number(e.target.value) || 1)))}
            />
          </label>
          <label>
            SIMULATION WINDOW
            <select
              value={duration}
              disabled={running}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </label>
          <div className="experiment-context">
            <span>
              <strong>{config.supply}</strong> drivers
            </span>
            <span>
              <strong>{config.demand.toFixed(1)}×</strong> demand
            </span>
            <span>
              Starts <strong>{String(config.startHour).padStart(2, '0')}:00</strong>
            </span>
          </div>
          <button className="primary-button" onClick={running ? stop : run}>
            {running ? <X size={15} /> : <Play size={15} fill="currentColor" />}
            {running ? 'Stop experiment' : results.length ? 'Run again' : 'Run benchmark'}
          </button>
        </div>
        <div className="benchmark-progress">
          <div style={{ width: `${(results.length / 6) * 100}%` }} />
        </div>
        <div className="experiment-status">
          <span className={running ? 'lime' : ''}>
            {running ? (
              <>
                <span className="status-dot pulse" />
                Evaluating {ALGORITHMS[results.length]?.name ?? 'results'}… {results.length}/6
              </>
            ) : results.length === 6 ? (
              <>
                <Check size={13} /> Experiment complete · {runSettings.duration} simulated minutes
              </>
            ) : (
              'Deterministic replay · independent engine instances · road-network costs'
            )}
          </span>
          <button className="text-button" onClick={exportCsv} disabled={!results.length}>
            <ArrowDownToLine size={13} /> Export CSV
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="benchmark-chart-header">
          <div>
            <span className="eyebrow">PERFORMANCE COMPARISON</span>
            <h3>
              {selected.name}
              <span>
                {selected.higher ? 'Higher is better' : 'Lower is better'}{' '}
                <ArrowUpRight size={12} />
              </span>
            </h3>
          </div>
          <select
            aria-label="Comparison metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
          >
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="benchmark-bars">
          {ALGORITHMS.map((a, i) => {
            const r = results.find((r) => r.algorithm === a.id);
            const v = r ? value(r.metrics, metric) : 0;
            return (
              <div className="benchmark-row" key={a.id}>
                <span>{a.name}</span>
                <div className="benchmark-track">
                  <div
                    style={{
                      width: `${r ? Math.max(1, (v / max) * 100) : 0}%`,
                      background: colors[i],
                    }}
                  />
                </div>
                <strong>
                  {r ? v.toFixed(metric === 'incomeVariance' ? 0 : 2) : '—'}{' '}
                  <small>{selected.unit}</small>
                  {r && v === best && results.length === 6 && <i>BEST</i>}
                </strong>
              </div>
            );
          })}
        </div>
        {!results.length && !running && (
          <div className="benchmark-empty">
            <FlaskConical size={17} />
            <span>Your next experiment starts here. Run a replay to reveal the trade-offs.</span>
          </div>
        )}
        <div className="benchmark-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dispatch engine</th>
                {fields.map((f) => (
                  <th key={f.key}>
                    {f.name}
                    <small>{f.unit}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.algorithm}>
                  <td>
                    <span className="table-dot" style={{ background: colors[i] }} />
                    {r.name}
                  </td>
                  {fields.map((f) => (
                    <td key={f.key}>
                      {value(r.metrics, f.key).toFixed(f.key === 'incomeVariance' ? 0 : 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="benchmark-note">
          <RotateCcw size={14} />
          <p>
            Every engine receives the same initial fleet, seed, order arrival times, origins,
            destinations, and passenger patience. Results include warm-up; unfinished trips remain
            in progress at the horizon. Completion and cancellation rates use all created orders.
            Utilization measures occupied driver time.
          </p>
        </footer>
      </section>
    </div>
  );
}
