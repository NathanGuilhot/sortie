import { describe, expect, it, vi } from 'vitest';
import { IPC_INVOKE_CHANNELS, type InvokeKey } from 'shared';

const registered = new Map<string, (event: unknown, args: unknown) => Promise<unknown>>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args: unknown) => Promise<unknown>) =>
      registered.set(channel, fn),
  },
}));

const KEY = Object.keys(IPC_INVOKE_CHANNELS)[0] as InvokeKey;
const CHANNEL = IPC_INVOKE_CHANNELS[KEY];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('installInvokeDispatchers', () => {
  it('holds calls made before startup until services are ready', async () => {
    const { installInvokeDispatchers, handleInvoke } = await import('../ipc/context');
    const ready = deferred();
    installInvokeDispatchers(ready.promise);

    const pending = registered.get(CHANNEL)!({}, { value: 1 });
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    const echo = (_event: unknown, args: unknown) => ({ echoed: args });
    handleInvoke(KEY, echo as unknown as Parameters<typeof handleInvoke>[1]);
    ready.resolve();

    await expect(pending).resolves.toEqual({ echoed: { value: 1 } });
  });
});
