// src/components/deskPet/usePetPhysics.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PetPhysicsResult {
    swingDeg: number;
    isLandingSquash: boolean;
    onDragMove: (clientX: number, timestampMs?: number) => void;
    onDragRelease: () => void;
    evaluatePointerProximity: (params: {
        pointerX: number;
        pointerY: number;
        petCenterX: number;
        petCenterY: number;
        timestampMs: number;
        currentState: string;
        isReducedMotion: boolean;
    }) => 'slow-blink' | 'cheek-bunt' | 'swat-cursor' | null;
}

export function usePetPhysics(): PetPhysicsResult {
    const [swingDeg, setSwingDeg] = useState(0);
    const [isLandingSquash, setIsLandingSquash] = useState(false);

    const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
    const lastDragXRef = useRef<{ x: number; t: number } | null>(null);
    const lastProximityTriggerRef = useRef<number>(0);
    const squashTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (squashTimerRef.current !== null) window.clearTimeout(squashTimerRef.current);
        };
    }, []);

    const onDragMove = useCallback((clientX: number, timestampMs: number = performance.now()) => {
        const prev = lastDragXRef.current;
        lastDragXRef.current = { x: clientX, t: timestampMs };
        if (!prev) return;

        const dt = Math.max(8, timestampMs - prev.t);
        const vx = ((clientX - prev.x) / dt) * 16; // px per frame
        const targetTilt = Math.max(-24, Math.min(24, -vx * 0.85));
        setSwingDeg((current) => Number((current * 0.45 + targetTilt * 0.55).toFixed(2)));
    }, []);

    const onDragRelease = useCallback(() => {
        lastDragXRef.current = null;
        setSwingDeg(0);
        setIsLandingSquash(true);
        if (squashTimerRef.current !== null) window.clearTimeout(squashTimerRef.current);
        squashTimerRef.current = window.setTimeout(() => {
            setIsLandingSquash(false);
        }, 240);
    }, []);

    const evaluatePointerProximity = useCallback(
        (params: {
            pointerX: number;
            pointerY: number;
            petCenterX: number;
            petCenterY: number;
            timestampMs: number;
            currentState: string;
            isReducedMotion: boolean;
        }): 'slow-blink' | 'cheek-bunt' | 'swat-cursor' | null => {
            const { pointerX, pointerY, petCenterX, petCenterY, timestampMs, currentState, isReducedMotion } = params;
            if (isReducedMotion) return null;

            const prev = lastPointerRef.current;
            lastPointerRef.current = { x: pointerX, y: pointerY, t: timestampMs };
            if (!prev) return null;

            const dt = Math.max(8, (timestampMs - prev.t) / 1000);
            const speed = Math.hypot(pointerX - prev.x, pointerY - prev.y) / dt;
            const distance = Math.hypot(pointerX - petCenterX, pointerY - petCenterY);

            if (timestampMs - lastProximityTriggerRef.current < 4500) return null;
            if (currentState !== 'idle' && currentState !== 'loaf') return null;

            if (distance < 52 && speed > 680) {
                lastProximityTriggerRef.current = timestampMs;
                return 'swat-cursor';
            }
            if (distance < 38 && speed < 140) {
                lastProximityTriggerRef.current = timestampMs;
                return 'cheek-bunt';
            }
            if (distance < 82 && speed < 180) {
                lastProximityTriggerRef.current = timestampMs;
                return 'slow-blink';
            }
            return null;
        },
        []
    );

    return {
        swingDeg,
        isLandingSquash,
        onDragMove,
        onDragRelease,
        evaluatePointerProximity,
    };
}