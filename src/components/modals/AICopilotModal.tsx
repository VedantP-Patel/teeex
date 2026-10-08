import React, { useState } from 'react';
import { Sparkles, X, Check, Copy, Wand2, Compass, AlertCircle, BookCheck } from 'lucide-react';
import katex from 'katex';
import type { Diagnostic } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsertCode: (code: string) => void;
  diagnostics: Diagnostic[];
}

type CopilotTab = 'equations' | 'tikz' | 'doctor' | 'polisher';

const SAMPLE_EQUATIONS: Record<string, string> = {
  'Maxwell Equations': `\\begin{align}
  \\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
  \\nabla \\cdot \\mathbf{B} &= 0 \\\\
  \\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
  \\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{align}`,
  'Schrödinger Wave Equation': `i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)`,
  'Euler-Lagrange Equation': `\\frac{d}{dt} \\left( \\frac{\\partial L}{\\partial \\dot{q}_j} \\right) - \\frac{\\partial L}{\\partial q_j} = 0`,
  'Gaussian Distribution': `f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)`,
  'Attention Mechanism (Transformer)': `\\text{Attention}(Q, K, V) = \\text{softmax}\\left( \\frac{Q K^T}{\\sqrt{d_k}} \\right) V`,
};

const SAMPLE_TIKZ: Record<string, string> = {
  'Neural Network Architecture': `\\begin{tikzpicture}[x=1.5cm, y=1.2cm, >=stealth]
  % Input Layer
  \\foreach \\m/\\l [count=\\y] in {1,2,3}
    \\node [circle, fill=sky-500, draw=blue!70, thick, minimum size=18pt] (I-\\m) at (0,-\\y) {};
  % Hidden Layer
  \\foreach \\m/\\l [count=\\y] in {1,2,3,4}
    \\node [circle, fill=emerald-500, draw=green!70, thick, minimum size=18pt] (H-\\m) at (2,-\\y+0.5) {};
  % Output Layer
  \\foreach \\m/\\l [count=\\y] in {1,2}
    \\node [circle, fill=purple-500, draw=purple!70, thick, minimum size=18pt] (O-\\m) at (4,-\\y-0.5) {};
  % Connect
  \\foreach \\i in {1,2,3}
    \\foreach \\j in {1,2,3,4}
      \\draw [->, opacity=0.4] (I-\\i) -- (H-\\j);
  \\foreach \\i in {1,2,3,4}
    \\foreach \\j in {1,2}
      \\draw [->, opacity=0.4] (H-\\i) -- (O-\\j);
\\end{tikzpicture}`,
  'Commutative Diagram': `\\begin{tikzpicture}[scale=1.5, >=stealth]
  \\node (A) at (0,1) {$X$};
  \\node (B) at (2,1) {$Y$};
  \\node (C) at (0,-0.5) {$A$};
  \\node (D) at (2,-0.5) {$B$};
  \\draw[->] (A) to node[above] {$f$} (B);
  \\draw[->] (A) to node[left] {$\\alpha$} (C);
  \\draw[->] (B) to node[right] {$\\beta$} (D);
  \\draw[->] (C) to node[below] {$g$} (D);
\\end{tikzpicture}`
};

export const AICopilotModal: React.FC<Props> = ({ isOpen, onClose, onInsertCode, diagnostics }) => {
  const [activeTab, setActiveTab] = useState<CopilotTab>('equations');
  const [prompt, setPrompt] = useState('');
  const [generatedResult, setGeneratedResult] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSelectSampleEquation = (title: string) => {
    setPrompt(title);
    setGeneratedResult(SAMPLE_EQUATIONS[title]);
  };

  const handleSelectSampleTikz = (title: string) => {
    setPrompt(title);
    setGeneratedResult(SAMPLE_TIKZ[title]);
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    const lower = prompt.toLowerCase();

    if (activeTab === 'equations') {
      if (lower.includes('schrodinger') || lower.includes('quantum')) {
        setGeneratedResult(SAMPLE_EQUATIONS['Schrödinger Wave Equation']);
      } else if (lower.includes('transformer') || lower.includes('attention')) {
        setGeneratedResult(SAMPLE_EQUATIONS['Attention Mechanism (Transformer)']);
      } else if (lower.includes('maxwell')) {
        setGeneratedResult(SAMPLE_EQUATIONS['Maxwell Equations']);
      } else {
        setGeneratedResult(`\\begin{equation}\n  \\mathcal{F}\\{f(t)\\} = \\int_{-\\infty}^{\\infty} f(t) e^{-i\\omega t} \\, dt\n\\end{equation}`);
      }
    } else if (activeTab === 'tikz') {
      if (lower.includes('diagram') || lower.includes('category')) {
        setGeneratedResult(SAMPLE_TIKZ['Commutative Diagram']);
      } else {
        setGeneratedResult(SAMPLE_TIKZ['Neural Network Architecture']);
      }
    } else if (activeTab === 'polisher') {
      setGeneratedResult(`The empirical evaluation corroborates our theoretical bounds, demonstrating a statistically significant reduction in latency ($p < 0.001$) under varying load conditions.`);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  let mathPreview = '';
  if (activeTab === 'equations' && generatedResult) {
    try {
      mathPreview = katex.renderToString(generatedResult.replace(/\\begin\{equation\*?\}/, '').replace(/\\end\{equation\*?\}/, '').trim(), {
        displayMode: true,
        throwOnError: false
      });
    } catch {
      mathPreview = '';
    }
  }

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#a855f7" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>AI LaTeX Copilot & Equation Doctor</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={tabBarStyle}>
          <button
            onClick={() => { setActiveTab('equations'); setGeneratedResult(SAMPLE_EQUATIONS['Attention Mechanism (Transformer)']); }}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'equations' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'equations' ? '2px solid #38bdf8' : '2px solid transparent',
            }}
          >
            <Wand2 size={13} /> Math & Equations
          </button>

          <button
            onClick={() => { setActiveTab('tikz'); setGeneratedResult(SAMPLE_TIKZ['Neural Network Architecture']); }}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'tikz' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'tikz' ? '2px solid #38bdf8' : '2px solid transparent',
            }}
          >
            <Compass size={13} /> TikZ Diagrams
          </button>

          <button
            onClick={() => setActiveTab('doctor')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'doctor' ? '#f43f5e' : 'var(--text-secondary)',
              borderBottom: activeTab === 'doctor' ? '2px solid #f43f5e' : '2px solid transparent',
            }}
          >
            <AlertCircle size={13} /> Error Doctor ({diagnostics.length})
          </button>

          <button
            onClick={() => { setActiveTab('polisher'); setGeneratedResult(`Our findings indicate a substantial improvement in convergence rate across diverse baseline benchmarks.`); }}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'polisher' ? '#10b981' : 'var(--text-secondary)',
              borderBottom: activeTab === 'polisher' ? '2px solid #10b981' : '2px solid transparent',
            }}
          >
            <BookCheck size={13} /> Academic Polisher
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeTab !== 'doctor' ? (
            <>
              {/* Presets / Chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', alignSelf: 'center' }}>Suggestions:</span>
                {activeTab === 'equations' && Object.keys(SAMPLE_EQUATIONS).map(k => (
                  <button
                    key={k}
                    onClick={() => handleSelectSampleEquation(k)}
                    style={chipStyle}
                  >
                    {k}
                  </button>
                ))}
                {activeTab === 'tikz' && Object.keys(SAMPLE_TIKZ).map(k => (
                  <button
                    key={k}
                    onClick={() => handleSelectSampleTikz(k)}
                    style={chipStyle}
                  >
                    {k}
                  </button>
                ))}
              </div>

              {/* Input Prompt */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={
                    activeTab === 'equations'
                      ? "Describe formula (e.g. Schrödinger equation, attention mechanism)..."
                      : activeTab === 'tikz'
                      ? "Describe diagram (e.g. 3-layer neural network, commutative square)..."
                      : "Paste colloquial sentence to polish into academic paper tone..."
                  }
                  style={{ flex: 1, padding: '8px 12px', fontSize: 12.5 }}
                  onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                />
                <button onClick={handleGenerate} className="btn-primary" style={{ fontSize: 12 }}>
                  <Sparkles size={13} /> Generate
                </button>
              </div>

              {/* Math Visual Preview if in equations */}
              {mathPreview && (
                <div style={{
                  backgroundColor: 'var(--bg-surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  textAlign: 'center',
                }} dangerouslySetInnerHTML={{ __html: mathPreview }} />
              )}

              {/* Code Output */}
              {generatedResult && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>GENERATED CODE</span>
                    <button onClick={handleCopy} className="btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}>
                      {copied ? <><Check size={12} color="#10b981" /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: '#38bdf8',
                    maxHeight: 180,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {generatedResult}
                  </pre>
                </div>
              )}
            </>
          ) : (
            /* Error Doctor Tab */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {diagnostics.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-secondary)' }}>
                  <Check size={28} color="#10b981" style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>No LaTeX Errors Detected</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Your document structure is fully healthy and compliant.
                  </div>
                </div>
              ) : (
                diagnostics.map(d => (
                  <div key={d.id} style={{
                    padding: 12,
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="badge badge-rose">Line {d.line}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.message}</span>
                    </div>
                    {d.suggestedFix && (
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.suggestedFix.description}</div>
                        <button
                          onClick={() => {
                            onInsertCode(d.suggestedFix!.replacement);
                            onClose();
                          }}
                          className="btn-primary"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          Apply Doctor Patch
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8, backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Close
          </button>
          {generatedResult && (
            <button
              onClick={() => {
                onInsertCode(generatedResult);
                onClose();
              }}
              className="btn-primary"
              style={{ fontSize: 12 }}
            >
              <Check size={14} /> Insert Into Document
            </button>
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
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const chipStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 'var(--radius-xs)',
  fontSize: 11,
  backgroundColor: 'var(--bg-surface-2)',
  color: '#38bdf8',
  border: '1px solid var(--border-subtle)',
  cursor: 'pointer',
};
