import { toast } from './stores/toastStore';

interface RunIpcTaskOptions<T> {
  run: () => Promise<T>;
  onSuccess?: (value: T) => void | Promise<void>;
  onError?: (message: string) => void | Promise<void>;
  onFinally?: () => void | Promise<void>;
}

export function getIpcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/s);
  return match ? match[1] : raw;
}

export async function runIpcTask<T>({
  run,
  onSuccess,
  onError,
  onFinally,
}: RunIpcTaskOptions<T>): Promise<T | null> {
  try {
    const value = await run();
    await onSuccess?.(value);
    return value;
  } catch (error) {
    await onError?.(getIpcErrorMessage(error));
    return null;
  } finally {
    await onFinally?.();
  }
}

export function showIpcError(error: unknown, prefix?: string): string {
  const message = getIpcErrorMessage(error);
  toast.error(prefix ? `${prefix}: ${message}` : message);
  return message;
}
