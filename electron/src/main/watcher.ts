import chokidar from 'chokidar';

export class WatcherService {
  private watchers: chokidar.FSWatcher[] = [];

  watchFolder(path: string) {
    const watcher = chokidar.watch(path, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    });
    this.watchers.push(watcher);
    return watcher;
  }

  stopAll() {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
  }
}