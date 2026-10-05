import type {
  AlgorithmMetadata,
  BenchmarkJob,
  SimulationConfig,
  SimulationEnvelope,
} from '../types';

const base = (import.meta.env?.VITE_API_BASE ?? '').replace(/\/$/, '');
export const apiUrl = (path: string) => `${base}${path}`;
export const websocketUrl = (path: string) => {
  const url = new URL(apiUrl(path), window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : JSON.stringify(body.detail ?? response.statusText);
    throw new ApiError(detail, response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  algorithms: () => request<AlgorithmMetadata[]>('/api/algorithms'),
  create: () => request<SimulationEnvelope>('/api/simulations', { method: 'POST', body: '{}' }),
  restore: (id: string) =>
    request<SimulationEnvelope>(`/api/simulations/${encodeURIComponent(id)}`),
  command: (id: string, action: string, data?: unknown, method = 'POST') =>
    request<SimulationEnvelope>(`/api/simulations/${encodeURIComponent(id)}/${action}`, {
      method,
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  startBenchmark: (config: SimulationConfig, duration: number) =>
    request<{ benchmarkId: string; status: string }>('/api/benchmarks', {
      method: 'POST',
      body: JSON.stringify({ config, duration }),
    }),
  benchmark: (id: string) => request<BenchmarkJob>(`/api/benchmarks/${encodeURIComponent(id)}`),
  cancelBenchmark: (id: string) =>
    request<void>(`/api/benchmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export async function downloadFromApi(path: string, filename: string) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new ApiError(`Export failed (${response.status})`, response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
