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
import type {
  AlgorithmMetadata,
  BenchmarkJob,
  BenchmarkResult,
  Metrics,
  SimulationConfig,
} from '../types';
import { api, ApiError, downloadFromApi, websocketUrl } from '../services/api';
import { ReconnectingSocket } from '../services/socket';
import { mergeBenchmark } from '../stores/frames';
import { useDialog } from './useDialog';

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
  algorithms: ALGORITHMS,
  connected,
  onClose,
}: {
  config: SimulationConfig;
  algorithms: AlgorithmMetadata[];
  connected: boolean;
  onClose(): void;
}) {
  useDialog(true, onClose);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [job, setJob] = useState<BenchmarkJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('vector.benchmark.job.v2');
    } catch {
      return null;
    }
  });
  const [pending, setPending] = useState(false);
  const [duration, setDuration] = useState(30);
  const [seed, setSeed] = useState(config.seed);
  const [metric, setMetric] = useState<MetricKey>('avgPickupETA');
  const [error, setError] = useState('');
  const [streamState, setStreamState] = useState('connecting');
  const [runSettings, setRunSettings] = useState({ ...config, duration: 30 });
  const activeId = useRef(jobId);
  const acceptedJob = useRef<BenchmarkJob | null>(null);
  activeId.current = jobId;
  const running = pending || Boolean(job && ['queued', 'running'].includes(job.status));
  const total = job?.total ?? ALGORITHMS.length;
  const acceptJob = (incoming: BenchmarkJob) => {
    if (incoming.benchmarkId !== activeId.current) return;
    const newlyRestored = acceptedJob.current?.benchmarkId !== incoming.benchmarkId;
    const latest = mergeBenchmark(acceptedJob.current, incoming);
    acceptedJob.current = latest;
    setJob(latest);
    setResults(latest.results);
    setRunSettings({ ...latest.config, duration: latest.duration / 60 });
    if (newlyRestored) {
      setSeed(latest.config.seed);
      setDuration(latest.duration / 60);
    }
    if (latest.error) setError(latest.error);
  };
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    void api
      .benchmark(jobId)
      .then((incoming) => {
        if (active) acceptJob(incoming);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          setJobId(null);
          setJob(null);
          try {
            localStorage.removeItem('vector.benchmark.job.v2');
          } catch {
            /* Optional persistence. */
          }
          setError('The saved benchmark is no longer available. Start a new experiment.');
        } else setError(error.message);
      });
    const socket = new ReconnectingSocket(
      websocketUrl(`/ws/benchmarks/${encodeURIComponent(jobId)}`),
      (raw, reconnected) => {
        const incoming = raw as BenchmarkJob & { type: string };
        if (incoming.type !== 'benchmark' || incoming.benchmarkId !== jobId) return false;
        if (active) acceptJob(incoming);
        if (reconnected)
          void api
            .benchmark(jobId)
            .then((current) => {
              if (active) acceptJob(current);
            })
            .catch(() => {});
        return true;
      },
      (status) => {
        if (active) setStreamState(status);
      },
    );
    return () => {
      active = false;
      socket.close();
    };
  }, [jobId]);
  const run = async () => {
    if (!connected || pending) return;
    setPending(true);
    setError('');
    try {
      const experimentConfig = job?.config ?? config;
      const response = await api.startBenchmark({ ...experimentConfig, seed }, duration * 60);
      setResults([]);
      setJob({
        ...response,
        config: { ...experimentConfig, seed },
        duration: duration * 60,
        results: [],
        completed: 0,
        total: ALGORITHMS.length,
      });
      setRunSettings({ ...experimentConfig, seed, duration });
      setJobId(response.benchmarkId);
      try {
        localStorage.setItem('vector.benchmark.job.v2', response.benchmarkId);
      } catch {}
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start experiment');
    } finally {
      setPending(false);
    }
  };
  const stop = async () => {
    if (!jobId || pending) return;
    setPending(true);
    try {
      await api.cancelBenchmark(jobId);
      acceptJob(await api.benchmark(jobId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not cancel experiment');
    } finally {
      setPending(false);
    }
  };
  const selected = fields.find((f) => f.key === metric)!;
  const displayConfig = job ? runSettings : config;
  const max = Math.max(1, ...results.map((r) => value(r.metrics, metric)));
  const best = results.length
    ? (selected.higher ? Math.max : Math.min)(...results.map((r) => value(r.metrics, metric)))
    : 0;
  const exportCsv = async () => {
    if (!jobId) return;
    try {
      await downloadFromApi(
        `/api/benchmarks/${encodeURIComponent(jobId)}/csv`,
        `vector-benchmark-seed-${runSettings.seed}.csv`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'CSV export failed');
    }
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
            <p>
              Replay an identical demand stream across {ALGORITHMS.length} registered dispatch
              engines.
            </p>
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
              {![15, 30, 60].includes(duration) && (
                <option value={duration}>{duration} minutes</option>
              )}
            </select>
          </label>
          <div className="experiment-context">
            <span>
              <strong>{displayConfig.supply}</strong> drivers
            </span>
            <span>
              <strong>{displayConfig.demand.toFixed(1)}×</strong> demand
            </span>
            <span>
              Starts <strong>{String(displayConfig.startHour).padStart(2, '0')}:00</strong>
            </span>
          </div>
          <button
            className="primary-button"
            disabled={
              pending || !connected || Boolean(jobId && running && streamState !== 'connected')
            }
            onClick={running ? stop : run}
          >
            {running ? <X size={15} /> : <Play size={15} fill="currentColor" />}
            {running ? 'Stop experiment' : results.length ? 'Run again' : 'Run benchmark'}
          </button>
        </div>
        <div className="benchmark-progress">
          <div style={{ width: `${(results.length / Math.max(1, total)) * 100}%` }} />
        </div>
        <div className="experiment-status">
          {job && (
            <button
              className="text-button"
              disabled={running}
              onClick={() => {
                setJob(null);
                setJobId(null);
                setResults([]);
                activeId.current = null;
                acceptedJob.current = null;
                setSeed(config.seed);
                setDuration(30);
                setError('');
                try {
                  localStorage.removeItem('vector.benchmark.job.v2');
                } catch {
                  /* Optional persistence. */
                }
              }}
            >
              Use live scenario
            </button>
          )}
          <span className={running ? 'lime' : ''}>
            {running ? (
              <>
                <span className="status-dot pulse" />
                Evaluating {ALGORITHMS[results.length]?.name ?? 'results'}… {results.length}/{total}
              </>
            ) : results.length === total ? (
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
        {jobId && running && streamState !== 'connected' && (
          <div className="error-box">
            Benchmark telemetry reconnecting. The backend job continues independently.
          </div>
        )}
        {job?.status === 'cancelled' && (
          <div className="error-box">
            Experiment cancelled. Completed engine results are retained.
          </div>
        )}
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
                      background: colors[i % colors.length],
                    }}
                  />
                </div>
                <strong>
                  {r ? v.toFixed(metric === 'incomeVariance' ? 0 : 2) : '—'}{' '}
                  <small>{selected.unit}</small>
                  {r && v === best && results.length === total && <i>BEST</i>}
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
                    <span className="table-dot" style={{ background: colors[i % colors.length] }} />
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
