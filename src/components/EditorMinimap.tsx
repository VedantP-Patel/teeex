import React, { useRef, useEffect, useCallback, useState } from 'react';
import { getThemeColors, type SyntaxTheme } from '../services/syntaxHighlighter';

interface Props {
  code: string;
  theme: SyntaxTheme;
  isLightMode: boolean;
  scrollTop: number;
  viewportHeight: number;
  totalContentHeight: number;
  onScrollTo: (targetScrollTop: number) => void;
  width?: number;
}

export const EditorMinimap: React.FC<Props> = ({
  code,
  theme,
  isLightMode,
  scrollTop,
  viewportHeight,
  totalContentHeight,
  onScrollTo,
  width = 62,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Render Minimap onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportHeight <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = viewportHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, viewportHeight);

    const colors = getThemeColors(theme, isLightMode);
    const lines = code.split('\n');
    const totalLines = Math.max(1, lines.length);

    // Calculate line height on minimap
    const minimapLineHeight = Math.max(1.8, Math.min(3.5, viewportHeight / totalLines));

    ctx.lineWidth = Math.max(1, minimapLineHeight * 0.7);

    for (let i = 0; i < totalLines; i++) {
      const line = lines[i];
      if (!line || line.trim().length === 0) continue;

      const y = i * minimapLineHeight;
      if (y > viewportHeight) break;

      const trimmed = line.trimStart();
      const indent = Math.min(18, (line.length - trimmed.length) * 1.5);

      // Determine primary token color for this line
      let strokeColor = colors.defaultText;
      if (trimmed.startsWith('%')) {
        strokeColor = colors.comment;
      } else if (trimmed.includes('\\begin') || trimmed.includes('\\end') || trimmed.startsWith('\\')) {
        strokeColor = colors.command;
      } else if (trimmed.includes('$') || trimmed.includes('\\[')) {
        strokeColor = colors.math;
      }

      ctx.fillStyle = strokeColor;
      ctx.globalAlpha = trimmed.startsWith('%') ? 0.45 : 0.75;

      // Draw word segments
      const words = trimmed.split(/\s+/);
      let currentX = 4 + indent;

      for (const word of words) {
        if (currentX >= width - 6) break;
        const wordLen = Math.min(16, word.length * 1.6);
        ctx.fillRect(currentX, y, wordLen, Math.max(1, minimapLineHeight - 0.8));
        currentX += wordLen + 2;
      }
    }

    ctx.globalAlpha = 1.0;

    // Draw Viewport Highlight Slider Box
    if (totalContentHeight > viewportHeight) {
      const visibleRatio = Math.min(1, viewportHeight / totalContentHeight);
      const sliderHeight = Math.max(20, viewportHeight * visibleRatio);
      const scrollRatio = Math.max(0, Math.min(1, scrollTop / (totalContentHeight - viewportHeight)));
      const sliderY = scrollRatio * (viewportHeight - sliderHeight);

      // Viewport background tint
      ctx.fillStyle = isLightMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.18)';
      ctx.fillRect(0, sliderY, width, sliderHeight);

      // Viewport borders
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, sliderY + 0.5, width - 1, sliderHeight - 1);
    }
  }, [code, theme, isLightMode, scrollTop, viewportHeight, totalContentHeight, width]);

  // Handle Drag / Click navigation
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, clickY / viewportHeight));
    const targetScroll = ratio * Math.max(0, totalContentHeight - viewportHeight);
    onScrollTo(targetScroll);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [viewportHeight, totalContentHeight, onScrollTo]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const moveY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, moveY / viewportHeight));
    const targetScroll = ratio * Math.max(0, totalContentHeight - viewportHeight);
    onScrollTo(targetScroll);
  }, [isDragging, viewportHeight, totalContentHeight, onScrollTo]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        width,
        height: '100%',
        backgroundColor: 'var(--bg-surface-0)',
        borderLeft: '1px solid var(--border-subtle)',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
      title="Code Minimap: Click or drag to jump across document"
    >
      <canvas
        ref={canvasRef}
        style={{
          width,
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
};
