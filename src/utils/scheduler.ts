/**
 * Teeex — Cooperative Task Scheduler Utility.
 *
 * Provides non-blocking execution for background work (cloud sync, IndexedDB persistence,
 * crash recovery mirrors) using the Prioritized Task Scheduling API (`scheduler.postTask`)
 * when available, with graceful fallbacks to `requestIdleCallback` and `setTimeout`.
 */

export type TaskPriority = 'user-blocking' | 'user-visible' | 'background';

export interface TaskOptions {
  priority?: TaskPriority;
  delay?: number;
  signal?: AbortSignal;
}

export function safePostTask<T>(
  callback: () => T | Promise<T>,
  options?: TaskOptions
): Promise<T> {
  // 1. Native Prioritized Task Scheduling API (Chrome 94+, Edge 94+)
  if (
    typeof window !== 'undefined' &&
    'scheduler' in window &&
    typeof (window as any).scheduler?.postTask === 'function'
  ) {
    return (window as any).scheduler.postTask(callback, options);
  }

  // 2. Fallback execution for unsupported runtimes (Firefox, Safari, Node.js / Vitest)
  return new Promise<T>((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      return reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'));
    }

    let isSettled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
        idleId = null;
      }
    };

    const onAbort = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(signal?.reason ?? new DOMException('This operation was aborted', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const run = async () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      try {
        resolve(await callback());
      } catch (err) {
        reject(err);
      }
    };

    const delay = Math.max(0, options?.delay || 0);

    const scheduleWork = () => {
      if (
        options?.priority === 'background' &&
        typeof window !== 'undefined' &&
        'requestIdleCallback' in window
      ) {
        idleId = window.requestIdleCallback(() => run(), { timeout: 2000 });
      } else {
        timerId = setTimeout(run, 0);
      }
    };

    if (delay > 0) {
      timerId = setTimeout(scheduleWork, delay);
    } else {
      scheduleWork();
    }
  });
}
