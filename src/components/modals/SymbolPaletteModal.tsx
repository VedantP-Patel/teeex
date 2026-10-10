import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, Hash, Plus, Code2, Trash2, Check, BookOpen, Layers } from 'lucide-react';
import katex from 'katex';

interface SymbolItem {
  cmd: string;
  name: string;
  category: 'Greek' | 'Operators' | 'Calculus' | 'Arrows' | 'Delimiters' | 'Logic';
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
  { cmd: '\\rho', name: 'Rho', category: 'Greek' },
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
  { cmd: '\\propto', name: 'Proportional to', category: 'Operators' },
  { cmd: '\\in', name: 'Element of', category: 'Operators' },
  { cmd: '\\notin', name: 'Not element of', category: 'Operators' },
  { cmd: '\\subset', name: 'Subset', category: 'Operators' },
  { cmd: '\\subseteq', name: 'Subset or Equal', category: 'Operators' },

  // Calculus & Analysis
  { cmd: '\\int', name: 'Integral', category: 'Calculus' },
  { cmd: '\\iint', name: 'Double Integral', category: 'Calculus' },
  { cmd: '\\oint', name: 'Contour Integral', category: 'Calculus' },
  { cmd: '\\sum', name: 'Summation', category: 'Calculus' },
  { cmd: '\\prod', name: 'Product', category: 'Calculus' },
  { cmd: '\\partial', name: 'Partial Derivative', category: 'Calculus' },
  { cmd: '\\nabla', name: 'Nabla / Gradient', category: 'Calculus' },
  { cmd: '\\infty', name: 'Infinity', category: 'Calculus' },
  { cmd: '\\lim_{x \\to 0}', name: 'Limit', category: 'Calculus' },

  // Arrows
  { cmd: '\\rightarrow', name: 'Right Arrow', category: 'Arrows' },
  { cmd: '\\leftarrow', name: 'Left Arrow', category: 'Arrows' },
  { cmd: '\\Rightarrow', name: 'Implies', category: 'Arrows' },
  { cmd: '\\Leftarrow', name: 'Implied by', category: 'Arrows' },
  { cmd: '\\Leftrightarrow', name: 'If and only if', category: 'Arrows' },
  { cmd: '\\mapsto', name: 'Maps to', category: 'Arrows' },

  // Delimiters & Brackets
  { cmd: '\\left( \\dots \\right)', name: 'Dynamic Parentheses', category: 'Delimiters' },
  { cmd: '\\left[ \\dots \\right]', name: 'Dynamic Brackets', category: 'Delimiters' },
  { cmd: '\\left\\{ \\dots \\right\\}', name: 'Dynamic Braces', category: 'Delimiters' },
  { cmd: '\\langle \\dots \\rangle', name: 'Angle Brackets', category: 'Delimiters' },

  // Logic & Sets
  { cmd: '\\forall', name: 'For All', category: 'Logic' },
  { cmd: '\\exists', name: 'There Exists', category: 'Logic' },
  { cmd: '\\neg', name: 'Negation', category: 'Logic' },
  { cmd: '\\land', name: 'Logical And', category: 'Logic' },
  { cmd: '\\lor', name: 'Logical Or', category: 'Logic' },
  { cmd: '\\cup', name: 'Union', category: 'Logic' },
  { cmd: '\\cap', name: 'Intersection', category: 'Logic' },
  { cmd: '\\emptyset', name: 'Empty Set', category: 'Logic' },
];

export interface SnippetItem {
  title: string;
  category: 'Matrices' | 'Quantum' | 'Algorithms' | 'TikZ' | 'Equations' | 'Structures';
  description: string;
  code: string;
  previewLatex?: string;
}

const SNIPPETS: SnippetItem[] = [
  // MATRICES
  {
    title: '2x2 Matrix (Parentheses)',
    category: 'Matrices',
    description: 'Standard 2x2 matrix with curved parentheses.',
    previewLatex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    code: `\\begin{pmatrix}
  a & b \\\\
  c & d
\\end{pmatrix}`,
  },
  {
    title: '3x3 Matrix (Square Brackets)',
    category: 'Matrices',
    description: 'Square bracketed 3x3 matrix commonly used in linear algebra.',
    previewLatex: '\\begin{bmatrix} a_{11} & a_{12} & a_{13} \\\\ a_{21} & a_{22} & a_{23} \\\\ a_{31} & a_{32} & a_{33} \\end{bmatrix}',
    code: `\\begin{bmatrix}
  a_{11} & a_{12} & a_{13} \\\\
  a_{21} & a_{22} & a_{23} \\\\
  a_{31} & a_{32} & a_{33}
\\end{bmatrix}`,
  },
  {
    title: 'Matrix Determinant (Vertical Bars)',
    category: 'Matrices',
    description: 'Determinant calculation represented with vertical bars.',
    previewLatex: '\\det(A) = \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc',
    code: `\\det(A) = \\begin{vmatrix}
  a & b \\\\
  c & d
\\end{vmatrix} = ad - bc`,
  },

  // QUANTUM & PHYSICS
  {
    title: 'Dirac Bra-Ket Overlap State',
    category: 'Quantum',
    description: 'Inner product and matrix element notation for quantum mechanics.',
    previewLatex: '\\langle \\psi | \\hat{H} | \\phi \\rangle = \\int \\psi^*(x) \\hat{H} \\phi(x) \\, dx',
    code: `\\langle \\psi | \\hat{H} | \\phi \\rangle`,
  },
  {
    title: 'Density Operator (Mixed Ensemble)',
    category: 'Quantum',
    description: 'Quantum state density matrix representation over pure state probabilities.',
    previewLatex: '\\hat{\\rho} = \\sum_{i} p_i |\\psi_i\\rangle\\langle\\psi_i|, \\quad \\operatorname{Tr}(\\hat{\\rho}) = 1',
    code: `\\hat{\\rho} = \\sum_{i} p_i |\\psi_i\\rangle\\langle\\psi_i|`,
  },
  {
    title: 'Commutator & Anti-Commutator',
    category: 'Quantum',
    description: 'Quantum operator commutation relation.',
    previewLatex: '[\\hat{x}, \\hat{p}] = i\\hbar \\hat{I}, \\quad \\{\\hat{A}, \\hat{B}\\} = \\hat{A}\\hat{B} + \\hat{B}\\hat{A}',
    code: `[\\hat{A}, \\hat{B}] = \\hat{A}\\hat{B} - \\hat{B}\\hat{A}`,
  },

  // ALGORITHMS
  {
    title: 'Algorithm & Pseudocode Environment',
    category: 'Algorithms',
    description: 'Structured pseudocode block with preconditions and loop invariants.',
    code: `\\begin{algorithm}[H]
\\caption{Stochastic Gradient Optimization}
\\label{alg:sgd}
\\begin{algorithmic}[1]
  \\REQUIRE Objective $f(\\theta)$, learning rate $\\eta$, iterations $T$
  \\ENSURE Optimized parameters $\\theta^*$
  \\STATE Initialize $\\theta_0 \\sim \\mathcal{N}(0, \\sigma^2 I)$
  \\FOR{$t = 1$ \\TO $T$}
    \\STATE Sample mini-batch $\\mathcal{B}_t \\subset \\mathcal{D}$
    \\STATE $g_t \\leftarrow \\frac{1}{|\\mathcal{B}_t|} \\sum_{x \\in \\mathcal{B}_t} \\nabla_\\theta f(\\theta_{t-1}; x)$
    \\STATE $\\theta_t \\leftarrow \\theta_{t-1} - \\eta \\, g_t$
  \\ENDFOR
  \\RETURN $\\theta_T$
\\end{algorithmic}
\\end{algorithm}`,
  },

  // TIKZ DIAGRAMS
  {
    title: 'Neural Network Layer (TikZ)',
    category: 'TikZ',
    description: 'Multi-layer perceptron architecture with input, hidden, and output nodes.',
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
    category: 'TikZ',
    description: 'Standard morphism arrow diagram for category theory.',
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
  },

  // EQUATIONS
  {
    title: 'Attention Mechanism (Transformer)',
    category: 'Equations',
    description: 'Scaled dot-product attention formulation used in modern deep learning.',
    previewLatex: '\\text{Attention}(Q, K, V) = \\text{softmax}\\left( \\frac{Q K^T}{\\sqrt{d_k}} \\right) V',
    code: `\\begin{equation}
\\text{Attention}(Q, K, V) = \\text{softmax}\\left( \\frac{Q K^T}{\\sqrt{d_k}} \\right) V
\\end{equation}`,
  },
  {
    title: 'Schrödinger Wave Equation',
    category: 'Equations',
    description: 'Time-dependent quantum wave mechanics differential equation.',
    previewLatex: 'i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)',
    code: `\\begin{equation}
i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)
\\end{equation}`,
  },

  // STRUCTURES
  {
    title: 'Piecewise Cases Function',
    category: 'Structures',
    description: 'Conditional piecewise mathematical function.',
    previewLatex: 'f(x) = \\begin{cases} x^2 & \\text{if } x \\geq 0 \\\\ -x & \\text{if } x < 0 \\end{cases}',
    code: `f(x) = \\begin{cases}
  x^2 & \\text{if } x \\geq 0 \\\\
  -x & \\text{if } x < 0
\\end{cases}`,
  },
  {
    title: 'Theorem and Proof Block',
    category: 'Structures',
    description: 'Formal academic mathematical theorem statement and proof.',
    code: `\\begin{theorem}[Universal Approximation]
Let $\\sigma$ be a non-constant, bounded continuous activation function. Then the set of single-layer neural networks is dense in $C(K)$ for any compact $K \\subset \\mathbb{R}^n$.
\\end{theorem}
\\begin{proof}
By the Stone-Weierstrass approximation theorem, the algebra generated by affine functions separates points on $K$.
\\end{proof}`,
  },
];

export interface MacroItem {
  id: string;
  name: string;        // e.g. \R
  argsCount?: number;  // e.g. 0 or 1
  definition: string;  // e.g. \mathbb{R}
  previewLatex: string;
  description: string;
  isCustom?: boolean;
}

const DEFAULT_MACROS: MacroItem[] = [
  { id: 'm-r', name: '\\R', argsCount: 0, definition: '\\mathbb{R}', previewLatex: '\\mathbb{R}', description: 'Real numbers field' },
  { id: 'm-c', name: '\\C', argsCount: 0, definition: '\\mathbb{C}', previewLatex: '\\mathbb{C}', description: 'Complex numbers field' },
  { id: 'm-n', name: '\\N', argsCount: 0, definition: '\\mathbb{N}', previewLatex: '\\mathbb{N}', description: 'Natural numbers' },
  { id: 'm-e', name: '\\E', argsCount: 0, definition: '\\mathbb{E}', previewLatex: '\\mathbb{E}[X]', description: 'Expectation operator' },
  { id: 'm-norm', name: '\\norm', argsCount: 1, definition: '\\left\\|#1\\right\\|', previewLatex: '\\left\\|x\\right\\|', description: 'Vector / matrix norm: \\norm{x}' },
  { id: 'm-abs', name: '\\abs', argsCount: 1, definition: '\\left|#1\\right|', previewLatex: '\\left|x\\right|', description: 'Absolute value: \\abs{x}' },
  { id: 'm-argmax', name: '\\argmax', argsCount: 0, definition: '\\operatorname*{arg\\,max}', previewLatex: '\\operatorname*{arg\\,max}_\\theta f(\\theta)', description: 'Argmax with proper subscript limit' },
  { id: 'm-ket', name: '\\ket', argsCount: 1, definition: '\\left|#1\\right\\rangle', previewLatex: '\\left|\\psi\\right\\rangle', description: 'Dirac ket state vector: \\ket{\\psi}' },
  { id: 'm-bra', name: '\\bra', argsCount: 1, definition: '\\left\\langle#1\\right|', previewLatex: '\\left\\langle\\psi\\right|', description: 'Dirac bra state vector: \\bra{\\psi}' },
  { id: 'm-braket', name: '\\braket', argsCount: 2, definition: '\\left\\langle#1\\middle|#2\\right\\rangle', previewLatex: '\\left\\langle\\psi\\middle|\\phi\\right\\rangle', description: 'State overlap: \\braket{\\psi}{\\phi}' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
  onAddPreambleMacro?: (macroDef: string) => void;
  initialTab?: 'symbols' | 'snippets' | 'macros';
}

export const SymbolPaletteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onInsert,
  onAddPreambleMacro,
  initialTab = 'symbols',
}) => {
  const [activeTab, setActiveTab] = useState<'symbols' | 'snippets' | 'macros'>(initialTab);
  const [search, setSearch] = useState('');
  const [selectedSymbolCategory, setSelectedSymbolCategory] = useState<string>('All');
  const [selectedSnippetCategory, setSelectedSnippetCategory] = useState<string>('All');

  // Custom user macros stored in localStorage
  const [customMacros, setCustomMacros] = useState<MacroItem[]>(() => {
    try {
      const saved = localStorage.getItem('teeex_custom_macros');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // New Macro Form state
  const [newMacroName, setNewMacroName] = useState('');
  const [newMacroArgs, setNewMacroArgs] = useState<number>(0);
  const [newMacroDef, setNewMacroDef] = useState('');
  const [newMacroDesc, setNewMacroDesc] = useState('');
  const [isAddingMacro, setIsAddingMacro] = useState(false);
  const [macroAddedToast, setMacroAddedToast] = useState<string | null>(null);

  // Sync initialTab when modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const allMacros = useMemo(() => {
    return [...DEFAULT_MACROS, ...customMacros];
  }, [customMacros]);

  const filteredSymbols = useMemo(() => {
    return SYMBOLS.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.cmd.toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedSymbolCategory === 'All' || s.category === selectedSymbolCategory;
      return matchesSearch && matchesCat;
    });
  }, [search, selectedSymbolCategory]);

  const filteredSnippets = useMemo(() => {
    return SNIPPETS.filter(sn => {
      const matchesCat = selectedSnippetCategory === 'All' || sn.category === selectedSnippetCategory;
      const matchesSearch = sn.title.toLowerCase().includes(search.toLowerCase()) || sn.description.toLowerCase().includes(search.toLowerCase()) || sn.code.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [search, selectedSnippetCategory]);

  const filteredMacros = useMemo(() => {
    return allMacros.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.definition.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [search, allMacros]);

  const handleSaveCustomMacro = (e: React.FormEvent) => {
    e.preventDefault();
    let name = newMacroName.trim();
    if (!name) return;
    if (!name.startsWith('\\')) name = '\\' + name;
    if (!newMacroDef.trim()) return;

    const newMacro: MacroItem = {
      id: `macro-${Date.now()}`,
      name,
      argsCount: newMacroArgs > 0 ? newMacroArgs : 0,
      definition: newMacroDef.trim(),
      previewLatex: newMacroDef.trim().replace(/#1/g, 'x').replace(/#2/g, 'y'),
      description: newMacroDesc.trim() || `User macro: ${name}`,
      isCustom: true,
    };

    const updated = [newMacro, ...customMacros];
    setCustomMacros(updated);
    localStorage.setItem('teeex_custom_macros', JSON.stringify(updated));

    setNewMacroName('');
    setNewMacroDef('');
    setNewMacroDesc('');
    setNewMacroArgs(0);
    setIsAddingMacro(false);
  };

  const handleDeleteCustomMacro = (id: string) => {
    const updated = customMacros.filter(m => m.id !== id);
    setCustomMacros(updated);
    localStorage.setItem('teeex_custom_macros', JSON.stringify(updated));
  };

  const handleAddMacroToPreamble = (m: MacroItem) => {
    if (!onAddPreambleMacro) return;
    const argsClause = m.argsCount && m.argsCount > 0 ? `[${m.argsCount}]` : '';
    const macroCode = `\\newcommand{${m.name}}${argsClause}{${m.definition}}`;
    onAddPreambleMacro(macroCode);
    setMacroAddedToast(m.name);
    setTimeout(() => setMacroAddedToast(null), 1800);
  };

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(56, 189, 248, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                LaTeX Symbols, Snippet Library &amp; Macro Manager
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Instant math palettes, publication blocks, and custom \newcommand macros
              </p>
            </div>
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
            <Hash size={13} /> Mathematical Symbols ({SYMBOLS.length})
          </button>

          <button
            onClick={() => setActiveTab('snippets')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'snippets' ? '#10b981' : 'var(--text-secondary)',
              borderBottom: activeTab === 'snippets' ? '2px solid #10b981' : '2px solid transparent',
            }}
          >
            <Code2 size={13} /> Snippets &amp; Environments ({SNIPPETS.length})
          </button>

          <button
            onClick={() => setActiveTab('macros')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'macros' ? '#a855f7' : 'var(--text-secondary)',
              borderBottom: activeTab === 'macros' ? '2px solid #a855f7' : '2px solid transparent',
            }}
          >
            <BookOpen size={13} /> Macro Manager (\newcommand) ({allMacros.length})
          </button>
        </div>

        {/* Search Bar & Sub-Filters */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={searchWrapStyle}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder={
                activeTab === 'symbols'
                  ? 'Search symbols (e.g. alpha, integral, nabla)...'
                  : activeTab === 'snippets'
                  ? 'Search snippets (e.g. matrix, algorithm, tikz, attention)...'
                  : 'Search macros (e.g. \\R, \\norm, \\argmax)...'
              }
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchInputStyle}
              autoFocus
            />
          </div>

          {/* Sub Filters for Symbols */}
          {activeTab === 'symbols' && (
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
              {['All', 'Greek', 'Operators', 'Calculus', 'Arrows', 'Delimiters', 'Logic'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSymbolCategory(cat)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    backgroundColor: selectedSymbolCategory === cat ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-surface-2)',
                    color: selectedSymbolCategory === cat ? '#38bdf8' : 'var(--text-secondary)',
                    border: `1px solid ${selectedSymbolCategory === cat ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Sub Filters for Snippets */}
          {activeTab === 'snippets' && (
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
              {['All', 'Matrices', 'Quantum', 'Algorithms', 'TikZ', 'Equations', 'Structures'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedSnippetCategory(cat)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10.5,
                    fontWeight: 600,
                    backgroundColor: selectedSnippetCategory === cat ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface-2)',
                    color: selectedSnippetCategory === cat ? '#10b981' : 'var(--text-secondary)',
                    border: `1px solid ${selectedSnippetCategory === cat ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* New Macro Button */}
          {activeTab === 'macros' && (
            <button
              onClick={() => setIsAddingMacro(prev => !prev)}
              className="btn-primary"
              style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
            >
              <Plus size={12} /> {isAddingMacro ? 'Cancel' : 'New Custom Macro'}
            </button>
          )}
        </div>

        {/* Content Body */}
        <div style={gridScrollStyle}>
          {/* TAB 1: SYMBOLS */}
          {activeTab === 'symbols' && (
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
                    title={`${s.name} (${s.cmd}) - Click to insert`}
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
          )}

          {/* TAB 2: SNIPPETS */}
          {activeTab === 'snippets' && (
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
                  <div
                    key={idx}
                    style={{
                      padding: 14,
                      backgroundColor: 'var(--bg-surface-0)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{sn.title}</span>
                          <span className="badge badge-emerald" style={{ fontSize: 9.5 }}>{sn.category}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sn.description}</div>
                      </div>
                      <button
                        onClick={() => {
                          onInsert(sn.code);
                          onClose();
                        }}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '5px 12px' }}
                      >
                        Insert Snippet
                      </button>
                    </div>

                    {renderedPreview && (
                      <div
                        dangerouslySetInnerHTML={{ __html: renderedPreview }}
                        style={{
                          padding: 10,
                          backgroundColor: 'var(--bg-app)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-xs)',
                          overflowX: 'auto',
                        }}
                      />
                    )}

                    <pre style={{
                      margin: 0,
                      padding: 10,
                      backgroundColor: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}>
                      {sn.code}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: MACROS */}
          {activeTab === 'macros' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Add Custom Macro Box */}
              {isAddingMacro && (
                <form
                  onSubmit={handleSaveCustomMacro}
                  style={{
                    padding: 14,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid #a855f7',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#a855f7' }}>
                    DEFINE NEW \\newcommand MACRO
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>COMMAND NAME (e.g. \loss or \diff)</label>
                      <input
                        type="text"
                        placeholder="\\mycmd"
                        value={newMacroName}
                        onChange={e => setNewMacroName(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', fontSize: 11.5, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-medium)', borderRadius: 4, color: 'var(--text-primary)' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>ARGUMENTS (0-9)</label>
                      <input
                        type="number"
                        min="0"
                        max="9"
                        value={newMacroArgs}
                        onChange={e => setNewMacroArgs(Number(e.target.value))}
                        style={{ width: '100%', padding: '6px 8px', fontSize: 11.5, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-medium)', borderRadius: 4, color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>LATEX DEFINITION (use #1, #2 for arguments)</label>
                    <input
                      type="text"
                      placeholder="e.g. \\mathcal{L}\\left(#1\\right)"
                      value={newMacroDef}
                      onChange={e => setNewMacroDef(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11.5, fontFamily: 'var(--font-mono)', backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-medium)', borderRadius: 4, color: 'var(--text-primary)' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>DESCRIPTION / NOTES</label>
                    <input
                      type="text"
                      placeholder="e.g. Loss functional over model predictions"
                      value={newMacroDesc}
                      onChange={e => setNewMacroDesc(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 11.5, backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-medium)', borderRadius: 4, color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                    <button type="button" onClick={() => setIsAddingMacro(false)} className="btn-secondary" style={{ fontSize: 11 }}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" style={{ fontSize: 11, backgroundColor: '#a855f7' }}>
                      Save Macro
                    </button>
                  </div>
                </form>
              )}

              {/* Toast for Added Macro */}
              {macroAddedToast && (
                <div style={{ padding: '8px 12px', borderRadius: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#10b981', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} /> Added <strong>{macroAddedToast}</strong> to document preamble!
                </div>
              )}

              {/* Macro Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                {filteredMacros.map(m => {
                  let rendered = m.previewLatex;
                  try {
                    rendered = katex.renderToString(m.previewLatex, { displayMode: false, throwOnError: false });
                  } catch {
                    rendered = m.previewLatex;
                  }

                  const preambleCode = `\\newcommand{${m.name}}${m.argsCount && m.argsCount > 0 ? `[${m.argsCount}]` : ''}{${m.definition}}`;

                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: 12,
                        backgroundColor: 'var(--bg-surface-0)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 12.5, color: '#a855f7', fontFamily: 'var(--font-mono)' }}>
                            {m.name} {m.argsCount && m.argsCount > 0 ? `[${m.argsCount}]` : ''}
                          </span>
                          {m.isCustom && (
                            <button
                              onClick={() => handleDeleteCustomMacro(m.id)}
                              className="btn-ghost"
                              style={{ padding: 2, color: '#f43f5e' }}
                              title="Delete custom macro"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.description}</div>
                      </div>

                      {/* KaTeX Preview */}
                      <div style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-app)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 34,
                        fontSize: 16,
                      }}>
                        <div dangerouslySetInnerHTML={{ __html: rendered }} />
                      </div>

                      {/* Code preview */}
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preambleCode}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => {
                            const insertText = m.argsCount && m.argsCount > 0 ? `${m.name}{}` : m.name;
                            onInsert(insertText);
                            onClose();
                          }}
                          className="btn-secondary"
                          style={{ flex: 1, fontSize: 10.5, padding: '4px 6px' }}
                          title="Insert command at cursor in editor"
                        >
                          Insert
                        </button>

                        {onAddPreambleMacro && (
                          <button
                            onClick={() => handleAddMacroToPreamble(m)}
                            className="btn-primary"
                            style={{ flex: 1, fontSize: 10.5, padding: '4px 6px', backgroundColor: '#a855f7' }}
                            title="Add \newcommand declaration to document preamble"
                          >
                            + Preamble
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-0)' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
            Rendered with KaTeX mathematical typesetting engine
          </span>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 11.5, padding: '4px 14px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

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
  width: '880px',
  maxWidth: '95vw',
  height: '80vh',
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
  padding: '12px 18px',
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
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  padding: '0 18px',
  gap: 16,
};

const tabBtnStyle: React.CSSProperties = {
  padding: '10px 0',
  fontSize: 12,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 10px',
  flex: 1,
  minWidth: '220px',
};

const searchInputStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: 12,
  width: '100%',
};

const gridScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 16,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
  gap: 8,
};

const symbolCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 4px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  color: 'var(--text-primary)',
};

const symbolCmdStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.05em',
  marginBottom: 4,
};
