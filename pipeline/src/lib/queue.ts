export type SerialQueue = <T>(work: () => T | Promise<T>) => Promise<T>;

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return async <T>(work: () => T | Promise<T>): Promise<T> => {
    const previous = tail;
    let release: () => void = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };
}
