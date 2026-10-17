// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useResizableSplit, type UseResizableSplitOptions } from '../../src/hooks/useResizableSplit';

describe('Resizable Split Hook (useResizableSplit)', () => {
  const STORAGE_KEY = 'teeex_split_percent_test';
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let currentHook: ReturnType<typeof useResizableSplit>;

  function TestComponent({ options }: { options?: UseResizableSplitOptions }) {
    currentHook = useResizableSplit(options);
    return null;
  }

  async function mount(options?: UseResizableSplitOptions) {
    await act(async () => {
      root.render(React.createElement(TestComponent, { options }));
    });
  }

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('initializes to default percent (50%) when no storage is present', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50, minPercent: 20, maxPercent: 80 });
    expect(currentHook.splitPercent).toBe(50);
  });

  it('restores stored percentage from localStorage within min/max boundaries', async () => {
    localStorage.setItem(STORAGE_KEY, '64.5');
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50, minPercent: 20, maxPercent: 80 });
    expect(currentHook.splitPercent).toBe(64.5);
  });

  it('clamps updates to minPercent (20%) and maxPercent (80%)', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50, minPercent: 20, maxPercent: 80 });

    await act(async () => {
      currentHook.setSplitPercent(10);
    });
    expect(currentHook.splitPercent).toBe(20);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('20');

    await act(async () => {
      currentHook.setSplitPercent(95);
    });
    expect(currentHook.splitPercent).toBe(80);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('80');
  });

  it('cycles presets through 50 -> 70 -> 30 -> 50 on cyclePresetSplit()', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50 });

    await act(async () => {
      currentHook.cyclePresetSplit();
    });
    expect(currentHook.splitPercent).toBe(70);

    await act(async () => {
      currentHook.cyclePresetSplit();
    });
    expect(currentHook.splitPercent).toBe(30);

    await act(async () => {
      currentHook.cyclePresetSplit();
    });
    expect(currentHook.splitPercent).toBe(50);
  });

  it('adjusts percentage via keyboard arrow keys (ArrowLeft / ArrowRight)', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50 });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await act(async () => {
      currentHook.handleKeyDownSplit({
        key: 'ArrowLeft',
        shiftKey: false,
        preventDefault,
        stopPropagation,
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(currentHook.splitPercent).toBe(48);
    expect(preventDefault).toHaveBeenCalled();

    await act(async () => {
      currentHook.handleKeyDownSplit({
        key: 'ArrowRight',
        shiftKey: true,
        preventDefault,
        stopPropagation,
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(currentHook.splitPercent).toBe(53); // 48 + 5
  });

  it('handles Home and End keys to jump to bounds', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50, minPercent: 20, maxPercent: 80 });

    await act(async () => {
      currentHook.handleKeyDownSplit({
        key: 'Home',
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(currentHook.splitPercent).toBe(20);

    await act(async () => {
      currentHook.handleKeyDownSplit({
        key: 'End',
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(currentHook.splitPercent).toBe(80);
  });

  it('manages pointer capture on pointer down and release on pointer up', async () => {
    await mount({ storageKey: STORAGE_KEY, defaultPercent: 50 });

    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);

    const fakeTarget = {
      setPointerCapture,
      releasePointerCapture,
      hasPointerCapture,
    };

    await act(async () => {
      currentHook.handlePointerDownSplit({
        pointerId: 42,
        currentTarget: fakeTarget,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(currentHook.isDraggingSplit).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(42);

    await act(async () => {
      currentHook.handlePointerUpSplit({
        pointerId: 42,
        currentTarget: fakeTarget,
      } as unknown as React.PointerEvent<HTMLElement>);
    });

    expect(currentHook.isDraggingSplit).toBe(false);
    expect(releasePointerCapture).toHaveBeenCalledWith(42);
  });
});
