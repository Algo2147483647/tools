/** A response may commit only while its request is the newest active request. */
export function createRequestGate() {
  let controller: AbortController | null = null;
  let generation = 0;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const currentController = controller;
      const currentGeneration = ++generation;
      return {
        signal: currentController.signal,
        isCurrent: () =>
          currentGeneration === generation && !currentController.signal.aborted,
        cancel: () => currentController.abort(),
      };
    },
    cancel() {
      generation++;
      controller?.abort();
    },
  };
}
