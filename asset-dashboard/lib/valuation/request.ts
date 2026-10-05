import { ValuationError } from "./types";

type RequestOptions = RequestInit & { next?: { revalidate: number } };
export interface PricingOptions {
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  budgetMs?: number;
  concurrency?: number;
  signal?: AbortSignal;
}

/** One context per portfolio: limits include queueing, response headers and JSON bodies. */
export function createPricingContext(options: PricingOptions = {}) {
  const deadline = Date.now() + (options.budgetMs ?? 25_000);
  const timeout = options.requestTimeoutMs ?? 5_000;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const fetcher = options.fetch ?? fetch;
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire() {
    if (options.signal?.aborted || Date.now() >= deadline) {
      throw new ValuationError("Pricing request exceeded its time budget or was cancelled.", 502);
    }
    if (active < concurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(new ValuationError("Pricing request exceeded its time budget.", 502));
      }, Math.max(1, deadline - Date.now()));
      waiting.push(ready);
    });
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  return {
    async json<T>(url: string | URL, init: RequestOptions = {}): Promise<T> {
      await acquire();
      const controller = new AbortController();
      const remaining = Math.min(timeout, deadline - Date.now());
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel: (() => void) | undefined;
      try {
        if (remaining <= 0 || options.signal?.aborted) {
          throw new ValuationError("Pricing request exceeded its time budget or was cancelled.", 502);
        }
        return await Promise.race([
          (async () => {
            const response = await fetcher(url, { ...init, signal: controller.signal });
            if (!response.ok) throw new ValuationError(`Market data request failed with HTTP ${response.status}.`, 502);
            return await response.json() as T;
          })(),
          new Promise<never>((_, reject) => {
            cancel = () => {
              controller.abort();
              reject(new ValuationError("Market data request timed out or was cancelled.", 502));
            };
            timer = setTimeout(cancel, remaining);
            options.signal?.addEventListener("abort", cancel, { once: true });
          })
        ]);
      } catch (error) {
        if (error instanceof ValuationError) throw error;
        throw new ValuationError("Market data provider returned an unavailable or invalid response.", 502);
      } finally {
        clearTimeout(timer);
        if (cancel) options.signal?.removeEventListener("abort", cancel);
        release();
      }
    }
  };
}

export type PricingContext = ReturnType<typeof createPricingContext>;
