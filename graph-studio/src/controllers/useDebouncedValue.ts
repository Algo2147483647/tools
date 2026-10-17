import { useEffect, useState } from "react";

/** Keep expensive geometry work off the stream of intermediate slider values. */
export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
