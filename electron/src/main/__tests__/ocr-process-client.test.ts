import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OcrBlock } from 'shared';
import type { OcrProcessReply, OcrProcessRequest } from 'pipeline';
import { OcrCancelledError, OcrProcessClient, type OcrChildProcess } from '../ocr-process-client';

class FakeChild extends EventEmitter {
  sent: OcrProcessRequest[] = [];
  killed = false;
  postMessage(message: OcrProcessRequest) {
    this.sent.push(message);
  }
  kill() {
    this.killed = true;
    this.emit('exit', 0);
    return true;
  }
  reply(message: OcrProcessReply) {
    this.emit('message', message);
  }
  crash() {
    this.emit('exit', 1);
  }
}

const block = (text: string): OcrBlock => ({
  text,
  bbox: { x: 0, y: 0, width: 1, height: 1 },
  confidence: 1,
});

function setup(idleMs = 1000, jobTimeoutMs?: number) {
  const children: FakeChild[] = [];
  const client = new OcrProcessClient(
    () => {
      const child = new FakeChild();
      children.push(child);
      return child as unknown as OcrChildProcess;
    },
    idleMs,
    jobTimeoutMs,
  );
  return { client, children, current: () => children[children.length - 1] };
}

afterEach(() => vi.useRealTimers());

describe('OcrProcessClient', () => {
  it('runs one job at a time and starts the process on demand', async () => {
    const { client, children, current } = setup();
    expect(children).toHaveLength(0);

    const a = client.extract('/a.jpg', 'background');
    const b = client.extract('/b.jpg', 'background');
    expect(current().sent.map((m) => m.filePath)).toEqual(['/a.jpg']);

    current().reply({ id: current().sent[0].id, blocks: [block('A')] });
    await expect(a).resolves.toEqual([block('A')]);
    expect(current().sent.map((m) => m.filePath)).toEqual(['/a.jpg', '/b.jpg']);

    current().reply({ id: current().sent[1].id, blocks: [] });
    await expect(b).resolves.toEqual([]);
    expect(children).toHaveLength(1);
  });

  it('runs interactive jobs before queued background ones', () => {
    const { client, current } = setup();
    void client.extract('/running.jpg', 'background');
    void client.extract('/later.jpg', 'background');
    void client.extract('/opened.jpg', 'interactive');

    current().reply({ id: current().sent[0].id, blocks: [] });
    expect(current().sent[1].filePath).toBe('/opened.jpg');
  });

  it('replaces a stuck process and retries the image', async () => {
    vi.useFakeTimers();
    const { client, children } = setup(1000, 500);
    const job = client.extract('/a.jpg', 'background');
    vi.advanceTimersByTime(500);
    expect(children[0].killed).toBe(true);
    expect(children[1].sent[0].filePath).toBe('/a.jpg');

    vi.advanceTimersByTime(500);
    await expect(job).rejects.toThrow('timed out');
  });

  it('retries once in a new process when the process dies, then gives up', async () => {
    const { client, children } = setup();
    const job = client.extract('/a.jpg', 'background');
    children[0].crash();
    expect(children).toHaveLength(2);
    expect(children[1].sent[0].filePath).toBe('/a.jpg');

    children[1].crash();
    const error = await job.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OcrCancelledError);
    expect((error as Error).message).toContain('crashed');
  });

  it('stops the process after being idle and starts a new one for the next job', () => {
    vi.useFakeTimers();
    const { client, children, current } = setup(1000);
    void client.extract('/a.jpg', 'interactive');
    current().reply({ id: current().sent[0].id, blocks: [] });

    vi.advanceTimersByTime(999);
    expect(children[0].killed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(children[0].killed).toBe(true);

    void client.extract('/b.jpg', 'interactive');
    expect(children).toHaveLength(2);
  });

  it('cancels every job on stop, without calling it a failure', async () => {
    const { client, current } = setup();
    const running = client.extract('/a.jpg', 'background');
    const queued = client.extract('/b.jpg', 'background');
    client.stop();

    await expect(running).rejects.toBeInstanceOf(OcrCancelledError);
    await expect(queued).rejects.toBeInstanceOf(OcrCancelledError);
    expect(current().killed).toBe(true);
    await expect(client.extract('/c.jpg', 'interactive')).rejects.toBeInstanceOf(OcrCancelledError);
  });
});
