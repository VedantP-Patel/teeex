// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safePostTask } from '../../src/utils/scheduler';

describe('Stage 5: safePostTask Cooperative Scheduler & Fallback Hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to native scheduler.postTask when available', async () => {
    const postTaskMock = vi.fn().mockResolvedValue('native-result');
    (window as any).scheduler = { postTask: postTaskMock };

    try {
      const res = await safePostTask(() => 'native-result', { priority: 'user-visible' });
      expect(res).toBe('native-result');
      expect(postTaskMock).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as any).scheduler;
    }
  });

  it('executes a synchronous task and returns the result', async () => {
    const result = await safePostTask(() => 42);
    expect(result).toBe(42);
  });

  it('executes an asynchronous task and resolves properly', async () => {
    const result = await safePostTask(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'completed';
    });
    expect(result).toBe('completed');
  });

  it('handles errors inside callback by rejecting the returned promise', async () => {
    await expect(
      safePostTask(() => {
        throw new Error('Sync error');
      })
    ).rejects.toThrow('Sync error');

    await expect(
      safePostTask(async () => {
        throw new Error('Async rejection');
      })
    ).rejects.toThrow('Async rejection');
  });

  it('rejects immediately when passed an already-aborted signal and does not run callback', async () => {
    const fn = vi.fn().mockReturnValue('should not run');
    const controller = new AbortController();
    controller.abort(new Error('Aborted by user'));

    await expect(
      safePostTask(fn, { signal: controller.signal })
    ).rejects.toThrow('Aborted by user');

    expect(fn).not.toHaveBeenCalled();
  });

  it('aborts during delay before start, preventing callback execution and clearing timer', async () => {
    const fn = vi.fn().mockReturnValue('delayed result');
    const controller = new AbortController();

    const taskPromise = safePostTask(fn, { delay: 60, signal: controller.signal });

    setTimeout(() => {
      controller.abort(new Error('Cancelled during delay'));
    }, 15);

    await expect(taskPromise).rejects.toThrow('Cancelled during delay');

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fn).not.toHaveBeenCalled();
  });

  it('honors configured delay timing in fallback execution', async () => {
    const start = Date.now();
    const result = await safePostTask(() => 'done', { delay: 40 });
    const elapsed = Date.now() - start;

    expect(result).toBe('done');
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });

  it('normalizes negative and non-finite delays (NaN, Infinity, -100) to safe immediate execution', async () => {
    const fn1 = vi.fn().mockReturnValue('negative');
    const fn2 = vi.fn().mockReturnValue('nan');
    const fn3 = vi.fn().mockReturnValue('inf');

    const res1 = await safePostTask(fn1, { delay: -500 });
    const res2 = await safePostTask(fn2, { delay: NaN });
    const res3 = await safePostTask(fn3, { delay: Infinity });

    expect(res1).toBe('negative');
    expect(res2).toBe('nan');
    expect(res3).toBe('inf');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
  });

  it('safely falls back to timer when requestIdleCallback is a non-callable object', async () => {
    // Some buggy polyfills or runtimes define window.requestIdleCallback as a non-function
    (window as any).requestIdleCallback = { notAFunction: true };
    (window as any).cancelIdleCallback = 'also-not-a-function';

    try {
      const fn = vi.fn().mockReturnValue('non-callable-safe');
      const res = await safePostTask(fn, { priority: 'background' });
      expect(res).toBe('non-callable-safe');
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as any).requestIdleCallback;
      delete (window as any).cancelIdleCallback;
    }
  });

  it('uses requestIdleCallback for background work when callable, honoring delay and cancellation', async () => {
    let idleCb: (() => void) | null = null;
    const cancelIdleMock = vi.fn();
    const requestIdleMock = vi.fn().mockImplementation((cb: () => void) => {
      idleCb = cb;
      return 1234;
    });

    (window as any).requestIdleCallback = requestIdleMock;
    (window as any).cancelIdleCallback = cancelIdleMock;

    try {
      // 1. Normal execution
      const fn = vi.fn().mockReturnValue('idle-done');
      const p = safePostTask(fn, { priority: 'background' });

      expect(requestIdleMock).toHaveBeenCalledTimes(1);
      expect(idleCb).not.toBeNull();
      idleCb!();

      const res = await p;
      expect(res).toBe('idle-done');
      expect(fn).toHaveBeenCalledTimes(1);

      // 2. Cancellation of idle task
      const fn2 = vi.fn().mockReturnValue('should be cancelled');
      const controller = new AbortController();
      const p2 = safePostTask(fn2, { priority: 'background', signal: controller.signal });

      expect(requestIdleMock).toHaveBeenCalledTimes(2);
      controller.abort(new Error('Idle task cancelled'));

      await expect(p2).rejects.toThrow('Idle task cancelled');
      expect(cancelIdleMock).toHaveBeenCalledWith(1234);
      expect(fn2).not.toHaveBeenCalled();
    } finally {
      delete (window as any).requestIdleCallback;
      delete (window as any).cancelIdleCallback;
    }
  });

  it('guarantees that a stale callback firing after cancellation cannot execute work', async () => {
    let capturedCallback: (() => void) | null = null;
    vi.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      capturedCallback = cb;
      return 999 as any;
    });

    const workFn = vi.fn().mockReturnValue('stale work');
    const controller = new AbortController();

    const promise = safePostTask(workFn, { signal: controller.signal });
    expect(capturedCallback).not.toBeNull();

    // Cancel before the callback executes
    controller.abort(new Error('Cancelled'));
    await expect(promise).rejects.toThrow('Cancelled');

    // Simulate delayed or rogue firing of the timeout callback
    capturedCallback!();

    expect(workFn).not.toHaveBeenCalled();
  });

  it('ensures callback is executed at most once', async () => {
    let count = 0;
    const res = await safePostTask(() => {
      count++;
      return count;
    });
    expect(res).toBe(1);
    expect(count).toBe(1);
  });
});
