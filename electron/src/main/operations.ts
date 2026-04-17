const controllers = new Map<string, AbortController>();

export function registerOperation(opId: string): AbortSignal {
  const existing = controllers.get(opId);
  if (existing) existing.abort();
  const ac = new AbortController();
  controllers.set(opId, ac);
  return ac.signal;
}

export function cancelOperation(opId: string): boolean {
  const ac = controllers.get(opId);
  if (!ac) return false;
  ac.abort();
  return true;
}

export function clearOperation(opId: string): void {
  controllers.delete(opId);
}
