import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import chokidar from 'chokidar';
import { WatcherService } from '../watcher';

vi.mock('chokidar', () => {
  const makeWatcher = () => {
    const watcher = {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    watcher.on.mockReturnValue(watcher);
    return watcher;
  };
  return {
    default: {
      watch: vi.fn(() => makeWatcher()),
    },
  };
});

const watchMock = vi.mocked(chokidar.watch);

describe('watcher path normalization', () => {
  beforeEach(() => {
    watchMock.mockClear();
  });

  it('does not start a second watcher for another spelling of the same folder', async () => {
    const service = new WatcherService();
    await service.watchFolder('/a/b');
    await service.watchFolder('/a/b/');

    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('stops a watcher regardless of the spelling it was registered with', async () => {
    const service = new WatcherService();
    await service.watchFolder('/a/b/');
    const watcher = watchMock.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> };

    service.stopWatching(path.resolve('/a/b/'));

    expect(watcher.close).toHaveBeenCalledTimes(1);
  });
});
