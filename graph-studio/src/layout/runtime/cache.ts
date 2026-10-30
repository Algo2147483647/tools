/** Bounded, session-only cache. No legacy browser entries or disk geometry. */
export class LayoutCache<T> {
  private entries = new Map<string, T>();
  constructor(private capacity = 12) {}
  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
  clear() {
    this.entries.clear();
  }
}
