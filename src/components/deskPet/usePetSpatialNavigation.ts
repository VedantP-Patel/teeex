// src/components/deskPet/usePetSpatialNavigation.ts
import { useCallback, useEffect, useState } from 'react';
import type { EditorCursorContext } from './petStateRegistry';

export interface PerchLandmark {
    id: string;
    x: number;
    y: number;
    width: number;
}

/**
 * Pure structural classifier run inside the editor before dispatching to useDeskPet.
 * Emits ONLY a categorical enum so zero document text or LaTeX strings ever reach DeskPet.
 */
export function classifyEditorCursorContext(activeEnvironments: readonly string[], isInMathMode: boolean): EditorCursorContext {
    if (activeEnvironments.some((env) => env === 'tikzpicture' || env === 'pgfpicture')) return 'tikz';
    if (activeEnvironments.some((env) => env === 'tabular' || env === 'tabularx' || env === 'longtable' || env === 'table')) return 'table';
    if (activeEnvironments.some((env) => env === 'figure' || env === 'wrapfigure')) return 'figure';
    if (activeEnvironments.some((env) => env === 'thebibliography' || env === 'filecontents')) return 'bib';
    if (isInMathMode || activeEnvironments.some((env) => /^(equation|align|gather|multline|cases|bmatrix|pmatrix)\*?$/.test(env))) {
        return 'math';
    }
    if (activeEnvironments.includes('preamble')) return 'preamble';
    return 'text';
}

export function usePetSpatialNavigation(isEnabled: boolean) {
    const [landmarks, setLandmarks] = useState<PerchLandmark[]>([]);
    const [dodgeOffsetX, setDodgeOffsetX] = useState(0);

    const scanLandmarks = useCallback(() => {
        if (typeof document === 'undefined') return;
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-pet-perch]'));
        const next: PerchLandmark[] = nodes.map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
                id: el.dataset.petPerch || `perch-${index}`,
                x: Math.round(rect.left + rect.width * 0.5),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
            };
        });
        setLandmarks(next);
    }, []);

    useEffect(() => {
        if (!isEnabled) return;
        scanLandmarks();
        const observer = new ResizeObserver(() => scanLandmarks());
        observer.observe(document.body);
        window.addEventListener('resize', scanLandmarks, { passive: true });
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', scanLandmarks);
        };
    }, [isEnabled, scanLandmarks]);

    const checkCaretObstruction = useCallback(
        (caretRect: { left: number; top: number; right: number; bottom: number } | null, petRect: { left: number; top: number; right: number; bottom: number }) => {
            if (!caretRect) {
                setDodgeOffsetX(0);
                return;
            }
            const pad = 18;
            const overlaps =
                caretRect.left < petRect.right + pad &&
                caretRect.right > petRect.left - pad &&
                caretRect.top < petRect.bottom + pad &&
                caretRect.bottom > petRect.top - pad;

            if (!overlaps) {
                setDodgeOffsetX(0);
                return;
            }

            const viewportMid = typeof window !== 'undefined' ? window.innerWidth / 2 : 600;
            const petMid = (petRect.left + petRect.right) / 2;
            setDodgeOffsetX(petMid > viewportMid ? -132 : 132);
        },
        []
    );

    return {
        landmarks,
        dodgeOffsetX,
        checkCaretObstruction,
        scanLandmarks,
    };
}