// Coalesce a call to `run(key)` across concurrent invocations with the same
// key. Used by WatcherService so that two overlapping chokidar watchers firing
// the same event for the same path only trigger one downstream operation.
export async function coalesceByPath(
  inflight: Set<string>,
  key: string,
  run: (key: string) => Promise<void>,
): Promise<void> {
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    await run(key);
  } finally {
    inflight.delete(key);
  }
}
