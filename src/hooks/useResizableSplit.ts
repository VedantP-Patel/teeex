import { useState, useCallback, useRef } from 'react';

export interface UseResizableSplitOptions {
  storageKey?: string;
  defaultPercent?: number;
  minPercent?: number;
  maxPercent?: number;
}

export function useResizableSplit(options: UseResizableSplitOptions = {}) {
  const {
    storageKey = 'teeex_split_percent',
    defaultPercent = 50,
    minPercent = 20,
    maxPercent = 80,
  } = options;

  const [splitPercent, setSplitPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= minPercent && val <= maxPercent) {
          return val;
        }
      }
    } catch {
      // Ignore storage errors
    }
    return defaultPercent;
  });

  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const rafIdRef = useRef<number | null>(null);

  const savePercent = useCallback((percent: number) => {
    try {
      localStorage.setItem(storageKey, String(percent));
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  const updateSplit = useCallback((percent: number) => {
    const clamped = Math.min(maxPercent, Math.max(minPercent, percent));
    setSplitPercent(clamped);
    savePercent(clamped);
  }, [maxPercent, minPercent, savePercent]);

  const handlePointerDownSplit = useCallback((e: React.PointerEvent<HTMLElement>) => {
    setIsDraggingSplit(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMoveSplit = useCallback((
    e: React.PointerEvent<HTMLElement>,
    sidebarWidth: number
  ) => {
    if (!isDraggingSplit) return;
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const availableWidth = window.innerWidth - sidebarWidth;
      if (availableWidth <= 0) return;
      const mouseRelativeX = e.clientX - sidebarWidth;
      const newPercent = (mouseRelativeX / availableWidth) * 100;
      updateSplit(newPercent);
    });
  }, [isDraggingSplit, updateSplit]);

  const handlePointerUpSplit = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (isDraggingSplit) {
      setIsDraggingSplit(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore pointer capture release error if detached
      }
    }
  }, [isDraggingSplit]);

  const cyclePresetSplit = useCallback(() => {
    setSplitPercent(prev => {
      let next: number;
      if (Math.abs(prev - 50) < 3) next = 70;
      else if (Math.abs(prev - 70) < 3) next = 30;
      else next = 50;
      savePercent(next);
      return next;
    });
  }, [savePercent]);

  const handleKeyDownSplit = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 5 : 2;
    let handled = false;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      updateSplit(splitPercent - step);
      handled = true;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      updateSplit(splitPercent + step);
      handled = true;
    } else if (e.key === 'Home') {
      updateSplit(minPercent);
      handled = true;
    } else if (e.key === 'End') {
      updateSplit(maxPercent);
      handled = true;
    } else if (e.key === 'Enter' || e.key === ' ') {
      cyclePresetSplit();
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [cyclePresetSplit, maxPercent, minPercent, splitPercent, updateSplit]);

  return {
    splitPercent,
    setSplitPercent: updateSplit,
    isDraggingSplit,
    handlePointerDownSplit,
    handlePointerMoveSplit,
    handlePointerUpSplit,
    handleKeyDownSplit,
    cyclePresetSplit,
  };
}
