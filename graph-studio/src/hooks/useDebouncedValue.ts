import { useEffect, useState } from "react";

/** Settle rapidly changing values before starting expensive work. */
export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
