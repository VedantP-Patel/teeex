import React, { useState, useMemo } from 'react';
import { Search, X, Hash } from 'lucide-react';
import katex from 'katex';

interface SymbolItem {
  cmd: string;
  name: string;
  category: 'Greek' | 'Operators' | 'Calculus' | 'Arrows' | 'Accents';
}

const SYMBOLS: SymbolItem[] = [
  // Greek
  { cmd: '\\alpha', name: 'Alpha', category: 'Greek' },
  { cmd: '\\beta', name: 'Beta', category: 'Greek' },
  { cmd: '\\gamma', name: 'Gamma', category: 'Greek' },
  { cmd: '\\delta', name: 'Delta', category: 'Greek' },
  { cmd: '\\epsilon', name: 'Epsilon', category: 'Greek' },
  { cmd: '\\theta', name: 'Theta', category: 'Greek' },
  { cmd: '\\lambda', name: 'Lambda', category: 'Greek' },
  { cmd: '\\mu', name: 'Mu', category: 'Greek' },
  { cmd: '\\pi', name: 'Pi', category: 'Greek' },
  { cmd: '\\sigma', name: 'Sigma', category: 'Greek' },
  { cmd: '\\tau', name: 'Tau', category: 'Greek' },
  { cmd: '\\phi', name: 'Phi', category: 'Greek' },
  { cmd: '\\psi', name: 'Psi', category: 'Greek' },
  { cmd: '\\omega', name: 'Omega', category: 'Greek' },
  { cmd: '\\Gamma', name: 'Capital Gamma', category: 'Greek' },
  { cmd: '\\Delta', name: 'Capital Delta', category: 'Greek' },
  { cmd: '\\Theta', name: 'Capital Theta', category: 'Greek' },
  { cmd: '\\Lambda', name: 'Capital Lambda', category: 'Greek' },
  { cmd: '\\Sigma', name: 'Capital Sigma', category: 'Greek' },
  { cmd: '\\Omega', name: 'Capital Omega', category: 'Greek' },

  // Operators & Relations
  { cmd: '\\pm', name: 'Plus-Minus', category: 'Operators' },
  { cmd: '\\times', name: 'Times', category: 'Operators' },
  { cmd: '\\div', name: 'Divide', category: 'Operators' },
  { cmd: '\\cdot', name: 'Dot', category: 'Operators' },
  { cmd: '\\leq', name: 'Less or Equal', category: 'Operators' },
  { cmd: '\\geq', name: 'Greater or Equal', category: 'Operators' },
  { cmd: '\\neq', name: 'Not Equal', category: 'Operators' },
  { cmd: '\\approx', name: 'Approximate', category: 'Operators' },
  { cmd: '\\equiv', name: 'Equivalent', category: 'Operators' },
  { cmd: '\\in', name: 'Element of', category: 'Operators' },
  { cmd: '\\notin', name: 'Not element of', category: 'Operators' },
  { cmd: '\\subset', name: 'Subset', category: 'Operators' },
  { cmd: '\\subseteq', name: 'Subset or Equal', category: 'Operators' },
  { cmd: '\\forall', name: 'For all', category: 'Operators' },
  { cmd: '\\exists', name: 'Exists', category: 'Operators' },

  // Calculus & Sets
  { cmd: '\\int', name: 'Integral', category: 'Calculus' },
  { cmd: '\\iint', name: 'Double Integral', category: 'Calculus' },
  { cmd: '\\oint', name: 'Contour Integral', category: 'Calculus' },
  { cmd: '\\sum', name: 'Summation', category: 'Calculus' },
  { cmd: '\\prod', name: 'Product', category: 'Calculus' },
  { cmd: '\\partial', name: 'Partial Derivative', category: 'Calculus' },
  { cmd: '\\nabla', name: 'Nabla / Del', category: 'Calculus' },
  { cmd: '\\infty', name: 'Infinity', category: 'Calculus' },
  { cmd: '\\cup', name: 'Union', category: 'Calculus' },
  { cmd: '\\cap', name: 'Intersection', category: 'Calculus' },

  // Arrows
  { cmd: '\\rightarrow', name: 'Right Arrow', category: 'Arrows' },
  { cmd: '\\leftarrow', name: 'Left Arrow', category: 'Arrows' },
  { cmd: '\\Rightarrow', name: 'Implies', category: 'Arrows' },
  { cmd: '\\Leftarrow', name: 'Implied by', category: 'Arrows' },
  { cmd: '\\Leftrightarrow', name: 'If and only if', category: 'Arrows' },
  { cmd: '\\mapsto', name: 'Maps to', category: 'Arrows' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
}

export const SymbolPaletteModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredSymbols = useMemo(() => {
    return SYMBOLS.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.cmd.toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedCategory === 'All' || s.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [search, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>LaTeX Math & Symbol Palette</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Search Bar & Category Filter */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={searchWrapStyle}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search symbols (e.g. alpha, integral, subset)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchInputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['All', 'Greek', 'Operators', 'Calculus', 'Arrows'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: selectedCategory === cat ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface-2)',
                  color: selectedCategory === cat ? '#38bdf8' : 'var(--text-secondary)',
                  border: `1px solid ${selectedCategory === cat ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-subtle)'}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol Grid */}
        <div style={gridScrollStyle}>
          <div style={gridStyle}>
            {filteredSymbols.map(s => {
              let rendered = s.cmd;
              try {
                rendered = katex.renderToString(s.cmd, { displayMode: false, throwOnError: false });
              } catch {
                rendered = s.cmd;
              }

              return (
                <button
                  key={s.cmd}
                  onClick={() => {
                    onInsert(s.cmd);
                    onClose();
                  }}
                  style={symbolCardStyle}
                  title={`${s.name} (${s.cmd})`}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: rendered }}
                    style={{ fontSize: 20, marginBottom: 4 }}
                  />
                  <span style={symbolCmdStyle}>{s.cmd}</span>
                </button>
              );
            })}
          </div>

          {filteredSymbols.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              No symbols matching "{search}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.72)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  animation: 'modalBackdrop 0.2s ease forwards',
};

const modalStyle: React.CSSProperties = {
  width: '640px',
  maxWidth: '92vw',
  maxHeight: '80vh',
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-medium)',
  boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'modalContent 0.25s var(--ease-spring) forwards',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 18px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const closeBtnStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
};

const searchWrapStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 10px',
};

const searchInputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  width: '100%',
  fontSize: 13,
  color: 'var(--text-primary)',
};

const gridScrollStyle: React.CSSProperties = {
  padding: 16,
  overflowY: 'auto',
  flex: 1,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))',
  gap: 8,
};

const symbolCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 6px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  transition: 'all 0.15s ease',
  cursor: 'pointer',
};

const symbolCmdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '85px',
};
