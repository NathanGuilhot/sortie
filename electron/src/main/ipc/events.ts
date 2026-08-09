import { BrowserWindow, type WebContents } from 'electron';
import { IPC_EVENT_CHANNELS, type EventKey, type EventPayloadByKey } from 'shared';

export type EmitTarget = WebContents | BrowserWindow | null | 'broadcast';

function webContentsFor(target: EmitTarget): WebContents[] {
  if (target === 'broadcast')
    return BrowserWindow.getAllWindows().map((window) => window.webContents);
  if (!target) return [];
  return 'webContents' in target ? [target.webContents] : [target];
}

export function emitToRenderer<K extends EventKey>(
  target: EmitTarget,
  key: K,
  payload: EventPayloadByKey[K],
): void {
  for (const contents of webContentsFor(target)) {
    if (!contents.isDestroyed()) contents.send(IPC_EVENT_CHANNELS[key], payload);
  }
}

export function emitterFor<K extends EventKey>(
  target: EmitTarget,
  key: K,
): (payload: EventPayloadByKey[K]) => void {
  return (payload) => emitToRenderer(target, key, payload);
}

export function createThrottledEmitter<K extends EventKey>(
  target: EmitTarget,
  key: K,
  intervalMs = 75,
): { emit: (payload: EventPayloadByKey[K]) => void; flush: () => void } {
  let lastSentAt = 0;
  let pending: EventPayloadByKey[K] | undefined;
  let timer: NodeJS.Timeout | undefined;

  const send = (payload: EventPayloadByKey[K]) => {
    lastSentAt = Date.now();
    emitToRenderer(target, key, payload);
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pending !== undefined) {
      const payload = pending;
      pending = undefined;
      send(payload);
    }
  };
  const emit = (payload: EventPayloadByKey[K]) => {
    const elapsed = Date.now() - lastSentAt;
    if (!timer && (lastSentAt === 0 || elapsed >= intervalMs)) {
      send(payload);
      return;
    }
    pending = payload;
    if (!timer) {
      timer = setTimeout(flush, Math.max(0, intervalMs - elapsed));
      timer.unref();
    }
  };
  return { emit, flush };
}
