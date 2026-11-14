import { describe, expect, it } from 'vitest';
import { PathTaskQueue } from '../pathTaskQueue';

describe('per-path work', () => {
  it('queues a final pass for changes arriving during an analysis', async () => {
    const queue = new PathTaskQueue<number>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const first = queue.run('/image', async () => {
      calls++;
      await gate;
      return 1;
    });
    await Promise.resolve();
    const second = queue.run('/image', async () => {
      calls++;
      return 2;
    });
    const third = queue.run('/image', async () => {
      calls++;
      return 3;
    });
    release();
    expect(await Promise.all([first, second, third])).toEqual([3, 3, 3]);
    expect(calls).toBe(2);
  });

  it('allows retry after failure and processes independent paths', async () => {
    const queue = new PathTaskQueue<number>();
    await expect(
      queue.run('/bad', async () => {
        throw new Error('broken');
      }),
    ).rejects.toThrow('broken');
    expect(await queue.run('/bad', async () => 2)).toBe(2);
    expect(
      await Promise.all([queue.run('/a', async () => 3), queue.run('/b', async () => 4)]),
    ).toEqual([3, 4]);
  });
});
