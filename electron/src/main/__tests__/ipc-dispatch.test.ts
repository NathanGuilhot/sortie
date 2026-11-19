import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE_CHANNELS, type InvokeKey } from 'shared';

const registered = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) => {
      if (registered.has(channel)) throw new Error(`duplicate handler for ${channel}`);
      registered.set(channel, fn);
    },
  },
}));

const KEY = Object.keys(IPC_INVOKE_CHANNELS)[0] as InvokeKey;
const CHANNEL = IPC_INVOKE_CHANNELS[KEY];

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function load() {
  vi.resetModules();
  registered.clear();
  return await import('../ipc/context');
}

describe('installInvokeDispatchers', () => {
  beforeEach(() => {
    registered.clear();
  });

  it('holds calls made before startup until services are ready', async () => {
    const { installInvokeDispatchers, handleInvoke } = await load();
    const ready = deferred();
    installInvokeDispatchers(ready.promise);
    expect(registered.size).toBe(new Set(Object.values(IPC_INVOKE_CHANNELS)).size);

    const pending = registered.get(CHANNEL)!({}, { value: 1 });
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    // The handler is registered by setupIpcHandlers after the call was made.
    const echo = (_event: unknown, args: unknown) => ({ echoed: args });
    handleInvoke(KEY, echo as unknown as Parameters<typeof handleInvoke>[1]);
    ready.resolve();

    await expect(pending).resolves.toEqual({ echoed: { value: 1 } });
  });

  it('rejects held calls when startup fails', async () => {
    const { installInvokeDispatchers } = await load();
    const ready = deferred();
    installInvokeDispatchers(ready.promise);

    const pending = registered.get(CHANNEL)!({}, undefined);
    ready.reject(new Error('database is locked'));

    await expect(pending).rejects.toThrow('database is locked');
  });

  it('reports channels nobody registered', async () => {
    const { installInvokeDispatchers } = await load();
    installInvokeDispatchers(Promise.resolve());

    await expect(registered.get(CHANNEL)!({}, undefined)).rejects.toThrow(
      `No handler registered for '${CHANNEL}'`,
    );
  });
});
