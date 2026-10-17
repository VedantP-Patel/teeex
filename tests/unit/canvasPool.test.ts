// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasPool } from '../../src/services/pdfRenderer';

describe('CanvasPool (Zero-Allocation Rendering)', () => {
  let pool: CanvasPool;

  beforeEach(() => {
    pool = new CanvasPool(3);
  });

  it('acquires and releases canvas instances up to maxPoolSize', () => {
    expect(pool.size).toBe(0);

    const c1 = pool.acquire(100, 200);
    expect(c1.width).toBe(100);
    expect(c1.height).toBe(200);
    expect(pool.size).toBe(0);

    pool.release(c1);
    expect(pool.size).toBe(1);

    // Re-acquire should reuse the existing canvas and resize if needed
    const c2 = pool.acquire(300, 400);
    expect(c2).toBe(c1);
    expect(c2.width).toBe(300);
    expect(c2.height).toBe(400);
    expect(pool.size).toBe(0);
  });

  it('caps the pool at maxPoolSize and zeroes memory of excess instances', () => {
    const c1 = pool.acquire(100, 100);
    const c2 = pool.acquire(100, 100);
    const c3 = pool.acquire(100, 100);
    const c4 = pool.acquire(100, 100);

    pool.release(c1);
    pool.release(c2);
    pool.release(c3);
    expect(pool.size).toBe(3);

    // Releasing 4th instance when max is 3 should zero its dimensions and not add to pool
    pool.release(c4);
    expect(pool.size).toBe(3);
    expect(c4.width).toBe(0);
    expect(c4.height).toBe(0);
  });

  it('clears all pooled instances and resets dimensions to 0', () => {
    const c1 = pool.acquire(200, 200);
    const c2 = pool.acquire(200, 200);
    pool.release(c1);
    pool.release(c2);
    expect(pool.size).toBe(2);

    pool.clear();
    expect(pool.size).toBe(0);
    expect(c1.width).toBe(0);
    expect(c2.width).toBe(0);
  });
});
