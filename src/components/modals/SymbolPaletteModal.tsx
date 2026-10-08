import React, { useState, useMemo } from 'react';
import { Search, X, Hash, Sigma, Compass } from 'lucide-react';
import katex from 'katex';

interface SymbolItem {
  cmd: string;
  name: string;
  category: 'Greek' | 'Operators' | 'Calculus' | 'Arrows';
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

interface SnippetItem {
  title: string;
  description: string;
  code: string;
  previewLatex?: string;
  type: 'equation' | 'tikz';
}

const SNIPPETS: SnippetItem[] = [
  {
    title: 'Attention Mechanism (Transformer)',
    description: 'Scaled dot-product attention formulation used in modern deep learning.',
    type: 'equation',
    previewLatex: '\\text{Attention}(Q, K, V) = \\text{softmax}\\left( \\frac{Q K^T}{\\sqrt{d_k}} \\right) V',
    code: `\\begin{equation}
\\text{Attention}(Q, K, V) = \\text{softmax}\\left( \\frac{Q K^T}{\\sqrt{d_k}} \\right) V
\\end{equation}`,
  },
  {
    title: 'Schrödinger Wave Equation',
    description: 'Time-dependent quantum wave mechanics differential equation.',
    type: 'equation',
    previewLatex: 'i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)',
    code: `\\begin{equation}
i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)
\\end{equation}`,
  },
  {
    title: 'Maxwell Equations (Differential)',
    description: 'Classical electrodynamics field equations.',
    type: 'equation',
    previewLatex: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\quad \\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}',
    code: `\\begin{align}
  \\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
  \\nabla \\cdot \\mathbf{B} &= 0 \\\\
  \\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
  \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{align}`,
  },
  {
    title: 'Gaussian Normal Distribution',
    description: 'Continuous probability density function.',
    type: 'equation',
    previewLatex: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)',
    code: `\\begin{equation}
f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)
\\end{equation}`,
  },
  {
    title: 'Neural Network Architecture (TikZ)',
    description: 'Multi-layer perceptron diagram with input, hidden, and output nodes.',
    type: 'tikz',
    code: `\\begin{tikzpicture}[x=1.5cm, y=1.2cm, >=stealth]
  % Input Layer
  \\foreach \\m in {1,2,3}
    \\node [circle, fill=blue!20, draw=blue, thick, minimum size=18pt] (I-\\m) at (0,-\\m) {};
  % Hidden Layer
  \\foreach \\m in {1,2,3,4}
    \\node [circle, fill=green!20, draw=green!70!black, thick, minimum size=18pt] (H-\\m) at (2,-\\m+0.5) {};
  % Output Layer
  \\foreach \\m in {1,2}
    \\node [circle, fill=purple!20, draw=purple, thick, minimum size=18pt] (O-\\m) at (4,-\\m-0.5) {};
  % Synapses
  \\foreach \\i in {1,2,3}
    \\foreach \\j in {1,2,3,4}
      \\draw [->, opacity=0.4] (I-\\i) -- (H-\\j);
  \\foreach \\i in {1,2,3,4}
    \\foreach \\j in {1,2}
      \\draw [->, opacity=0.4] (H-\\i) -- (O-\\j);
\\end{tikzpicture}`,
  },
  {
    title: 'Commutative Diagram (TikZ)',
    description: 'Standard morphism arrow diagram for category theory.',
    type: 'tikz',
    code: `\\begin{tikzpicture}[scale=1.5, >=stealth]
  \\node (A) at (0,1) {$X$};
  \\node (B) at (2,1) {$Y$};
  \\node (C) at (0,-0.5) {$A$};
  \\node (D) at (2,-0.5) {$B$};
  \\draw[->] (A) to node[above] {$f$} (B);
  \\draw[->] (A) to node[left] {$\\alpha$} (C);
  \\draw[->] (B) to node[right] {$\\beta$} (D);
  \\draw[->] (C) to node[below] {$g$} (D);
\\end{tikzpicture}`,
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
}

export const SymbolPaletteModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [activeTab, setActiveTab] = useState<'symbols' | 'equations' | 'tikz'>('symbols');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const filteredSymbols = useMemo(() => {
    return SYMBOLS.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.cmd.toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedCategory === 'All' || s.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [search, selectedCategory]);

  const filteredSnippets = useMemo(() => {
    return SNIPPETS.filter(sn => {
      const isType = activeTab === 'equations' ? sn.type === 'equation' : sn.type === 'tikz';
      const matchesSearch = sn.title.toLowerCase().includes(search.toLowerCase()) || sn.description.toLowerCase().includes(search.toLowerCase());
      return isType && matchesSearch;
    });
  }, [search, activeTab]);

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              LaTeX Mathematical Symbols & Snippet Library
            </h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={tabBarStyle}>
          <button
            onClick={() => setActiveTab('symbols')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'symbols' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'symbols' ? '2px solid #38bdf8' : '2px solid transparent',
            }}
          >
            <Hash size={13} /> Symbols ({SYMBOLS.length})
          </button>

          <button
            onClick={() => setActiveTab('equations')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'equations' ? '#10b981' : 'var(--text-secondary)',
              borderBottom: activeTab === 'equations' ? '2px solid #10b981' : '2px solid transparent',
            }}
          >
            <Sigma size={13} /> Equations
          </button>

          <button
            onClick={() => setActiveTab('tikz')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'tikz' ? '#a855f7' : 'var(--text-secondary)',
              borderBottom: activeTab === 'tikz' ? '2px solid #a855f7' : '2px solid transparent',
            }}
          >
            <Compass size={13} /> TikZ Diagrams
          </button>
        </div>

        {/* Search Bar & Sub-Filters */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={searchWrapStyle}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder={activeTab === 'symbols' ? "Search symbols (e.g. alpha, integral)..." : "Search templates (e.g. attention, maxwell, neural)..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchInputStyle}
              autoFocus
            />
          </div>

          {activeTab === 'symbols' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Greek', 'Operators', 'Calculus', 'Arrows'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: 11,
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
          )}
        </div>

        {/* Content Body */}
        <div style={gridScrollStyle}>
          {activeTab === 'symbols' ? (
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
          ) : (
            /* Equations & TikZ snippets */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredSnippets.map((sn, idx) => {
                let renderedPreview = '';
                if (sn.previewLatex) {
                  try {
                    renderedPreview = katex.renderToString(sn.previewLatex, { displayMode: true, throwOnError: false });
                  } catch {
                    renderedPreview = '';
                  }
                }

                return (
                  <div key={idx} style={{
                    padding: 14,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{sn.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sn.description}</div>
                      </div>
                      <button
                        onClick={() => {
                          onInsert(sn.code);
                          onClose();
                        }}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
                        Insert Snippet
                      </button>
                    </div>

                    {renderedPreview && (
                      <div
                        style={{
                          backgroundColor: 'var(--bg-surface-1)',
                          padding: 10,
                          borderRadius: 4,
                          textAlign: 'center',
                          border: '1px solid var(--border-subtle)',
                        }}
                        dangerouslySetInnerHTML={{ __html: renderedPreview }}
                      />
                    )}

                    <pre style={{
                      margin: 0,
                      padding: 8,
                      backgroundColor: 'var(--bg-surface-1)',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      color: '#38bdf8',
                      maxHeight: 100,
                      overflowY: 'auto',
                    }}>
                      {sn.code}
                    </pre>
                  </div>
                );
              })}
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
  width: '680px',
  maxWidth: '92vw',
  maxHeight: '85vh',
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

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 6px',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const searchWrapStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 8px',
};

const searchInputStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  width: '100%',
  fontSize: 12.5,
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
