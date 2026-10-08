import React, { useState } from 'react';
import { Table, Plus, Trash2, X, Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latexCode: string) => void;
}

export const TableBuilderModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [rows, setRows] = useState<string[][]>([
    ['Parameter', 'Description', 'Value', 'Unit'],
    ['\\alpha', 'Coupling Constant', '0.042', '\\text{eV}'],
    ['\\beta', 'Damping Factor', '1.18', '\\text{s}^{-1}'],
    ['\\gamma', 'Decoherence Rate', '0.009', '\\text{kHz}']
  ]);

  const [alignments, setAlignments] = useState<('l' | 'c' | 'r')[]>(['l', 'l', 'c', 'c']);
  const [useHlines, setUseHlines] = useState(true);
  const [caption, setCaption] = useState('Experimental system parameters and measured values.');
  const [label, setLabel] = useState('tab:parameters');

  if (!isOpen) return null;

  const numCols = alignments.length;

  const handleCellChange = (rIdx: number, cIdx: number, val: string) => {
    const newRows = [...rows];
    newRows[rIdx] = [...newRows[rIdx]];
    newRows[rIdx][cIdx] = val;
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, new Array(numCols).fill('')]);
  };

  const removeRow = (rIdx: number) => {
    if (rows.length <= 1) return;
    setRows(rows.filter((_, idx) => idx !== rIdx));
  };

  const addCol = () => {
    setAlignments([...alignments, 'c']);
    setRows(rows.map(r => [...r, '']));
  };

  const removeCol = (cIdx: number) => {
    if (alignments.length <= 1) return;
    setAlignments(alignments.filter((_, idx) => idx !== cIdx));
    setRows(rows.map(r => r.filter((_, idx) => idx !== cIdx)));
  };

  const toggleAlignment = (cIdx: number) => {
    const cycle: ('l' | 'c' | 'r')[] = ['l', 'c', 'r'];
    const current = alignments[cIdx];
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    const nextAlignments = [...alignments];
    nextAlignments[cIdx] = next;
    setAlignments(nextAlignments);
  };

  // Generate LaTeX code
  const alignSpec = alignments.join(' ');
  const generateLatex = () => {
    let out = `\\begin{table}[htbp]\n\\centering\n`;
    if (caption) out += `\\caption{${caption}}\n`;
    if (label) out += `\\label{${label}}\n`;
    out += `\\begin{tabular}{${alignSpec}}\n`;
    if (useHlines) out += `\\hline\n`;

    rows.forEach((r, idx) => {
      const line = r.map(c => c.trim() || '---').join(' & ') + ' \\\\';
      out += line + '\n';
      if (useHlines && (idx === 0 || idx === rows.length - 1)) {
        out += `\\hline\n`;
      }
    });

    out += `\\end{tabular}\n\\end{table}`;
    return out;
  };

  const latexOutput = generateLatex();

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Table size={18} color="#10b981" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Visual Table & Matrix Builder</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={addRow} className="btn-secondary" style={{ fontSize: 12 }}>
              <Plus size={14} /> Add Row
            </button>
            <button onClick={addCol} className="btn-secondary" style={{ fontSize: 12 }}>
              <Plus size={14} /> Add Column
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useHlines}
                onChange={e => setUseHlines(e.target.checked)}
                style={{ accentColor: '#10b981' }}
              />
              Borders (\hline)
            </label>
          </div>

          {/* Interactive Grid */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 8, backgroundColor: 'var(--bg-surface-0)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  {alignments.map((align, cIdx) => (
                    <th key={cIdx} style={{ padding: 6, textAlign: 'center' }}>
                      <button
                        onClick={() => toggleAlignment(cIdx)}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--bg-surface-2)',
                          color: '#38bdf8',
                          border: '1px solid var(--border-subtle)'
                        }}
                        title="Click to cycle alignment: left (l) / center (c) / right (r)"
                      >
                        Align: {align.toUpperCase()}
                      </button>
                      {alignments.length > 1 && (
                        <button
                          onClick={() => removeCol(cIdx)}
                          style={{ color: 'var(--accent-rose)', marginLeft: 4, padding: 2 }}
                          title="Remove column"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ textAlign: 'center' }}>
                      {rows.length > 1 && (
                        <button
                          onClick={() => removeRow(rIdx)}
                          style={{ color: 'var(--text-muted)', padding: 2 }}
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: 4 }}>
                        <input
                          type="text"
                          value={cell}
                          onChange={e => handleCellChange(rIdx, cIdx, e.target.value)}
                          placeholder={`R${rIdx + 1} C${cIdx + 1}`}
                          style={{
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: 12,
                            backgroundColor: rIdx === 0 ? 'var(--bg-surface-2)' : 'var(--bg-surface-1)',
                            fontWeight: rIdx === 0 ? 600 : 400,
                            textAlign: alignments[cIdx] === 'c' ? 'center' : alignments[cIdx] === 'r' ? 'right' : 'left',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Caption & Label Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                TABLE CAPTION
              </label>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                LABEL (\label)
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Generated LaTeX Code Preview */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              GENERATED LATEX CODE
            </label>
            <pre style={{
              margin: 0,
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-0)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#38bdf8',
              maxHeight: 120,
              overflowY: 'auto',
            }}>
              {latexOutput}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10, backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 12 }}>
            Cancel
          </button>
          <button
            onClick={() => {
              onInsert(latexOutput);
              onClose();
            }}
            className="btn-primary"
            style={{ fontSize: 12 }}
          >
            <Check size={14} /> Insert Table
          </button>
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
  width: '720px',
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
