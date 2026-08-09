import { describe, expect, it } from 'vitest';
import { coalesceByPath } from '../watcher-coalesce';

// When /foo and /foo/bar are both watched, chokidar emits `add` for files in
// the overlap region TWICE: once per watcher. coalesceByPath de-duplicates
// these concurrent invocations so addImage() only runs once.

describe('coalesceByPath', () => {
  it('deduplicates concurrent invocations for the same key', async () => {
    const inflight = new Set<string>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const run = async () => {
      calls += 1;
      await gate;
    };

    const first = coalesceByPath(inflight, '/foo/bar/x.jpg', run);
    const second = coalesceByPath(inflight, '/foo/bar/x.jpg', run);

    release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(inflight.size).toBe(0);
  });

  it('allows a second run for the same key AFTER the first resolves', async () => {
    const inflight = new Set<string>();
    let calls = 0;
    const run = async () => {
      calls += 1;
    };

    await coalesceByPath(inflight, '/foo/x.jpg', run);
    await coalesceByPath(inflight, '/foo/x.jpg', run);

    expect(calls).toBe(2);
  });

  it('does not block different keys', async () => {
    const inflight = new Set<string>();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const run = async () => {
      calls += 1;
      await gate;
    };

    const a = coalesceByPath(inflight, '/foo/a.jpg', run);
    const b = coalesceByPath(inflight, '/foo/b.jpg', run);
    release();
    await Promise.all([a, b]);

    expect(calls).toBe(2);
  });

  it('releases the inflight slot even if run throws', async () => {
    const inflight = new Set<string>();
    const run = async () => {
      throw new Error('boom');
    };

    await expect(coalesceByPath(inflight, '/foo/x.jpg', run)).rejects.toThrow('boom');
    expect(inflight.size).toBe(0);
  });
});
