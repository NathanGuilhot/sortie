// Recheck a path after events arriving during its current pass. All callers await the final pass.
export class PathTaskQueue<T> {
  private pending = new Map<
    string,
    { dirty: boolean; run: () => Promise<T>; promise: Promise<T> }
  >();

  run(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      existing.dirty = true;
      existing.run = run;
      return existing.promise;
    }
    const entry = { dirty: false, run, promise: null as unknown as Promise<T> };
    entry.promise = Promise.resolve()
      .then(async () => {
        for (;;) {
          entry.dirty = false;
          try {
            const value = await entry.run();
            if (!entry.dirty) return value;
          } catch (error) {
            if (!entry.dirty) throw error;
          }
        }
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, entry);
    return entry.promise;
  }
}
