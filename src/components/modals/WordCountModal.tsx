import React, { useState } from 'react';
import { BarChart2, X, Target, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import type { ParsedDocument } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wordCount: number;
  equationCount: number;
  parsedDoc: ParsedDocument;
  activeCode: string;
}

const CONFERENCE_PRESETS = [
  { name: 'IEEE Conference Paper', maxWords: 3800, maxPages: 6 },
  { name: 'ACM Full Conference Paper', maxWords: 6000, maxPages: 10 },
  { name: 'Nature Communications Letter', maxWords: 2500, maxPages: 4 },
  { name: 'University Thesis Chapter', maxWords: 8000, maxPages: 25 },
];

export const WordCountModal: React.FC<Props> = ({
  isOpen,
  onClose,
  wordCount,
  equationCount,
  parsedDoc,
  activeCode,
}) => {
  const [selectedTarget, setSelectedTarget] = useState(CONFERENCE_PRESETS[0]);

  if (!isOpen) return null;

  const charCount = activeCode.length;
  const estimatedPages = Math.max(1, Math.ceil(wordCount / 650));
  const percentUsed = Math.min(100, Math.round((wordCount / selectedTarget.maxWords) * 100));
  const isOverLimit = wordCount > selectedTarget.maxWords;

  // Breakdown by section
  const sectionBreakdown = parsedDoc.sections.map((sec, idx) => {
    const nextSec = parsedDoc.sections[idx + 1];
    const lines = activeCode.split('\n');
    const startLine = sec.line;
    const endLine = nextSec ? nextSec.line - 1 : lines.length;
    const secText = lines.slice(startLine, endLine).join(' ').replace(/\\(.*?)\{.*?\}/g, '');
    const count = secText.trim().split(/\s+/).filter(w => w.length > 0).length;
    return { title: sec.title, words: count };
  });

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Academic Word Count & Target Limits</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Top Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL WORDS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8' }}>{wordCount}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>EST. PAGES</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{estimatedPages} / {selectedTarget.maxPages}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>EQUATIONS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{equationCount}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>CHARACTERS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{charCount.toLocaleString()}</div>
            </div>
          </div>

          {/* Conference Target Selector & Progress Bar */}
          <div style={{ backgroundColor: 'var(--bg-surface-0)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Target size={14} color="#38bdf8" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>CONFERENCE TARGET</span>
              </div>
              <select
                value={selectedTarget.name}
                onChange={e => {
                  const target = CONFERENCE_PRESETS.find(p => p.name === e.target.value);
                  if (target) setSelectedTarget(target);
                }}
                style={{ padding: '4px 8px', fontSize: 11.5 }}
              >
                {CONFERENCE_PRESETS.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} (Max {p.maxWords} words)
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: 8, backgroundColor: 'var(--bg-surface-2)', borderRadius: 9999, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                width: `${percentUsed}%`,
                height: '100%',
                backgroundColor: isOverLimit ? '#f43f5e' : percentUsed > 85 ? '#f59e0b' : '#10b981',
                borderRadius: 9999,
                transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>{wordCount} of {selectedTarget.maxWords} words ({percentUsed}%)</span>
              <span style={{ color: isOverLimit ? '#f43f5e' : '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {isOverLimit ? <><AlertTriangle size={12} /> Limit Exceeded by {wordCount - selectedTarget.maxWords} words</> : <><CheckCircle2 size={12} /> Within Conference Limit ({selectedTarget.maxWords - wordCount} words remaining)</>}
              </span>
            </div>
          </div>

          {/* Section Breakdown */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Layers size={13} color="var(--text-muted)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                SECTION-BY-SECTION BREAKDOWN
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {sectionBreakdown.map((sec, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    backgroundColor: 'var(--bg-surface-0)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sec.title}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: 11 }}>
                    {sec.words} words
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Done
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
  width: '620px',
  maxWidth: '92vw',
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
  padding: '14px 20px',
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

const statCardStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
