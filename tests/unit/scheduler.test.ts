import { describe, it, expect, vi } from 'vitest';
import { safePostTask } from '../../src/utils/scheduler';

describe('safePostTask Cooperative Scheduler', () => {
  it('executes a synchronous task and returns the result', async () => {
    const result = await safePostTask(() => 42);
    expect(result).toBe(42);
  });

  it('executes an asynchronous task and resolves properly', async () => {
    const result = await safePostTask(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'completed';
    });
    expect(result).toBe('completed');
  });

  it('handles errors inside callback by rejecting the returned promise', async () => {
    await expect(
      safePostTask(() => {
        throw new Error('Simulation error');
      })
    ).rejects.toThrow('Simulation error');
  });

  it('rejects immediately when passed an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Aborted by user'));

    await expect(
      safePostTask(() => 'should not run', { signal: controller.signal })
    ).rejects.toThrow('Aborted by user');
  });

  it('runs tasks with background priority via fallback or scheduler', async () => {
    const fn = vi.fn().mockReturnValue('bg-ok');
    const res = await safePostTask(fn, { priority: 'background' });
    expect(res).toBe('bg-ok');
    expect(fn).toHaveBeenCalled();
  });
});
