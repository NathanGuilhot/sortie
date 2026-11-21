import type { OcrBlock } from 'shared';
import type { OcrProcessReply, OcrProcessRequest } from 'pipeline';

/** Interactive jobs (the image view) run before background ones. */
export type OcrLane = 'interactive' | 'background';

/** The slice of Electron's UtilityProcess this client uses. */
export interface OcrChildProcess {
  postMessage(message: OcrProcessRequest): void;
  on(event: 'message', listener: (message: OcrProcessReply) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  kill(): boolean;
}

/** OCR was stopped (quit), not failed: never record it as an error. */
export class OcrCancelledError extends Error {
  constructor() {
    super('OCR cancelled');
    this.name = 'OcrCancelledError';
  }
}

interface Job {
  id: number;
  filePath: string;
  crashes: number;
  resolve: (blocks: OcrBlock[]) => void;
  reject: (error: Error) => void;
}

const DEFAULT_IDLE_MS = 5 * 60_000;
// OCR takes well under a second per image; a job this slow is stuck.
const DEFAULT_JOB_TIMEOUT_MS = 60_000;
const MAX_CRASHES_PER_JOB = 2;

/**
 * Runs OCR in a separate process, one image at a time. The process starts on
 * the first job and stops after `idleMs` without work, freeing its memory.
 */
export class OcrProcessClient {
  private child: OcrChildProcess | null = null;
  private running: Job | null = null;
  private interactive: Job[] = [];
  private background: Job[] = [];
  private nextId = 1;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private jobTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly spawn: () => OcrChildProcess,
    private readonly idleMs = DEFAULT_IDLE_MS,
    private readonly jobTimeoutMs = DEFAULT_JOB_TIMEOUT_MS,
  ) {}

  extract(filePath: string, lane: OcrLane): Promise<OcrBlock[]> {
    if (this.stopped) return Promise.reject(new OcrCancelledError());
    return new Promise<OcrBlock[]>((resolve, reject) => {
      const job: Job = { id: this.nextId++, filePath, crashes: 0, resolve, reject };
      (lane === 'interactive' ? this.interactive : this.background).push(job);
      this.pump();
    });
  }

  /** Stops the process and cancels every job. Later calls are cancelled too. */
  stop(): void {
    this.stopped = true;
    this.clearIdleTimer();
    this.clearJobTimer();
    const jobs = [...(this.running ? [this.running] : []), ...this.interactive, ...this.background];
    this.running = null;
    this.interactive = [];
    this.background = [];
    this.killChild();
    for (const job of jobs) job.reject(new OcrCancelledError());
  }

  private pump(): void {
    if (this.running || this.stopped) return;
    const job = this.interactive.shift() ?? this.background.shift();
    if (!job) {
      this.scheduleIdleStop();
      return;
    }
    this.clearIdleTimer();
    this.running = job;
    this.ensureChild().postMessage({ id: job.id, filePath: job.filePath });
    this.jobTimer = setTimeout(() => this.onStuck(job), this.jobTimeoutMs);
    this.jobTimer.unref?.();
  }

  private ensureChild(): OcrChildProcess {
    if (this.child) return this.child;
    const child = this.spawn();
    child.on('message', (reply) => this.onReply(reply));
    child.on('exit', () => this.onExit(child));
    this.child = child;
    return child;
  }

  private onReply(reply: OcrProcessReply): void {
    const job = this.running;
    if (!job || job.id !== reply.id) return;
    this.clearJobTimer();
    this.running = null;
    if ('error' in reply) job.reject(new Error(reply.error));
    else job.resolve(reply.blocks);
    this.pump();
  }

  private onExit(child: OcrChildProcess): void {
    if (this.child !== child) return;
    this.child = null;
    this.retryOrFail('OCR process crashed on this image');
  }

  private onStuck(job: Job): void {
    if (this.running !== job) return;
    // Replace the process; its exit event is ignored since it's no longer current.
    this.killChild();
    this.retryOrFail('OCR timed out on this image');
  }

  /** The running job lost its process: try it once more in a fresh one. */
  private retryOrFail(reason: string): void {
    this.clearJobTimer();
    const job = this.running;
    if (!job) return;
    this.running = null;
    job.crashes += 1;
    if (job.crashes >= MAX_CRASHES_PER_JOB) job.reject(new Error(reason));
    else this.interactive.unshift(job);
    this.pump();
  }

  private scheduleIdleStop(): void {
    if (!this.child || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.running) this.killChild();
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearJobTimer(): void {
    if (!this.jobTimer) return;
    clearTimeout(this.jobTimer);
    this.jobTimer = null;
  }

  private killChild(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
  }
}
