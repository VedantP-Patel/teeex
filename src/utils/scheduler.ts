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
    if (options?.signal?.aborted) {
      return reject(options.signal.reason);
    }

    const abortHandler = () => {
      reject(options?.signal?.reason);
    };
    options?.signal?.addEventListener('abort', abortHandler, { once: true });

    const execute = async () => {
      try {
        const result = await callback();
        options?.signal?.removeEventListener('abort', abortHandler);
        resolve(result);
      } catch (err) {
        options?.signal?.removeEventListener('abort', abortHandler);
        reject(err);
      }
    };

    const delay = options?.delay || 0;

    if (
      options?.priority === 'background' &&
      typeof window !== 'undefined' &&
      'requestIdleCallback' in window
    ) {
      window.requestIdleCallback(() => execute(), { timeout: Math.max(delay, 2000) });
    } else if (delay > 0) {
      setTimeout(execute, delay);
    } else {
      setTimeout(execute, 0);
    }
  });
}
