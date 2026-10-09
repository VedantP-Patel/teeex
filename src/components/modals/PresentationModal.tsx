import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Presentation } from 'lucide-react';
import { extractBeamerSlides, type BeamerSlide } from '../../services/latexParser';
import katex from 'katex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  latexCode: string;
  projectTitle: string;
}

export const PresentationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  latexCode,
  projectTitle,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const slides: BeamerSlide[] = React.useMemo(() => {
    const extracted = extractBeamerSlides(latexCode);
    if (extracted.length > 0) return extracted;

    // Fallback: convert sections into slides if not explicit beamer frames
    const secRegex = /\\section\*?\{([^}]+)\}([\s\S]*?)(?=\\section|\z)/g;
    const fallbackSlides: BeamerSlide[] = [];
    let match: RegExpExecArray | null;
    let sNum = 1;

    while ((match = secRegex.exec(latexCode)) !== null) {
      fallbackSlides.push({
        title: match[1].trim(),
        content: match[2].trim().slice(0, 500),
        slideNumber: sNum++,
      });
    }

    if (fallbackSlides.length === 0) {
      return [{
        title: projectTitle,
        content: 'Press ESC to exit presentation mode.',
        slideNumber: 1,
      }];
    }

    return fallbackSlides;
  }, [latexCode, projectTitle]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlideIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, slides.length, onClose]);

  if (!isOpen) return null;

  const currentSlide = slides[currentSlideIndex] || slides[0];

  const renderSlideContent = (content: string) => {
    let clean = content
      .replace(/\\begin\{itemize\}/g, '<ul class="slide-list">')
      .replace(/\\end\{itemize\}/g, '</ul>')
      .replace(/\\item\s+([^\n]+)/g, '<li>$1</li>')
      .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
      .replace(/\\\\/g, '<br/>');

    // Replace display equations
    clean = clean.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math) => {
      try {
        return `<div class="slide-math">${katex.renderToString(math.trim(), { displayMode: true })}</div>`;
      } catch {
        return math;
      }
    });

    // Replace inline math
    clean = clean.replace(/\$([^\$\n]+)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false });
      } catch {
        return math;
      }
    });

    return { __html: clean };
  };

  return (
    <div style={overlayStyle}>
      <div style={{
        ...deckContainerStyle,
        width: isFullscreen ? '100vw' : '90vw',
        height: isFullscreen ? '100vh' : '85vh',
        maxWidth: isFullscreen ? 'none' : '1100px',
        maxHeight: isFullscreen ? 'none' : '720px',
      }}>
        {/* Top Control Bar */}
        <div style={controlBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Presentation size={16} color="#38bdf8" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              {projectTitle} &bull; Slide {currentSlideIndex + 1} of {slides.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="btn-ghost"
              style={{ padding: 4 }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Slide Screen (16:9 Aspect Ratio Presentation Frame) */}
        <div style={slideViewportStyle}>
          <div style={slideCardStyle}>
            {/* Slide Header */}
            <div style={slideHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                {currentSlide.title}
              </h2>
            </div>

            {/* Slide Body */}
            <div
              style={slideBodyStyle}
              dangerouslySetInnerHTML={renderSlideContent(currentSlide.content)}
            />

            {/* Slide Footer */}
            <div style={slideFooterStyle}>
              <span style={{ fontSize: 11, color: '#64748b' }}>Teeex Studio &bull; {projectTitle}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#0284c7' }}>
                {currentSlideIndex + 1} / {slides.length}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Navigation Bar */}
        <div style={navBarStyle}>
          <button
            onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
            disabled={currentSlideIndex === 0}
            className="btn-secondary"
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ChevronLeft size={14} /> Previous
          </button>

          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Use Left / Right arrow keys or Space to navigate &bull; ESC to exit
          </span>

          <button
            onClick={() => setCurrentSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
            disabled={currentSlideIndex === slides.length - 1}
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  backdropFilter: 'blur(6px)',
  zIndex: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const deckContainerStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const controlBarStyle: React.CSSProperties = {
  height: 40,
  padding: '0 16px',
  backgroundColor: 'var(--bg-surface-1)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};

const slideViewportStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: '#080a0f',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  overflow: 'hidden',
};

const slideCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 880,
  height: '100%',
  maxHeight: 495, // 16:9 ratio approximately
  backgroundColor: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  padding: '36px 44px',
  position: 'relative',
};

const slideHeaderStyle: React.CSSProperties = {
  borderBottom: '2px solid #38bdf8',
  paddingBottom: 12,
  marginBottom: 20,
};

const slideBodyStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '16px',
  lineHeight: 1.6,
  color: '#1e293b',
  overflowY: 'auto',
  fontFamily: 'var(--font-ui)',
};

const slideFooterStyle: React.CSSProperties = {
  borderTop: '1px solid #e2e8f0',
  paddingTop: 10,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const navBarStyle: React.CSSProperties = {
  height: 48,
  padding: '0 20px',
  backgroundColor: 'var(--bg-surface-1)',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};
