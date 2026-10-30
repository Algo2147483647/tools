export const REFRESH_INTERVAL_MS = 60_000;

/** One request at a time; hidden tabs pause and failed requests back off to five minutes. */
export function createAutoRefresh(options: {
  run: () => Promise<boolean>;
  isVisible: () => boolean;
  onUnexpectedError?: (error: unknown) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let failures = 0;
  let retryAt = 0;

  function schedule(delay: number) {
    clearTimeout(timer);
    if (!stopped && options.isVisible()) timer = setTimeout(() => { void execute(); }, delay);
  }

  async function execute() {
    if (stopped || running || !options.isVisible()) return;
    if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
    running = true;
    let success = false;
    try { success = await options.run(); } catch (error) { options.onUnexpectedError?.(error); }
    finally {
      running = false;
      failures = success ? 0 : Math.min(failures + 1, 3);
      const delay = Math.min(REFRESH_INTERVAL_MS * 2 ** failures, 300_000);
      retryAt = success ? 0 : Date.now() + delay;
      schedule(delay);
    }
  }

  return {
    start() { void execute(); },
    visibilityChanged() {
      clearTimeout(timer);
      if (options.isVisible()) void execute();
    },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
