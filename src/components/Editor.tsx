import React, { useRef, useEffect } from 'react';
import {
  Bold,
  Italic,
  Sigma,
  Quote,
  List
} from 'lucide-react';
import type { Collaborator, Diagnostic } from '../types/latex';

interface Props {
  code: string;
  fileName: string;
  onChange: (newCode: string) => void;
  diagnostics: Diagnostic[];
  peers: Collaborator[];
  onCursorChange: (line: number, col: number) => void;
  onCompileShortcut: () => void;
  targetLine: number | null;
  onClearTargetLine: () => void;
}

export const Editor: React.FC<Props> = ({
  code,
  fileName,
  onChange,
  diagnostics,
  peers,
  onCursorChange,
  onCompileShortcut,
  targetLine,
  onClearTargetLine,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lines = code.split('\n');

  // Gutter diagnostics map: line -> Diagnostic
  const diagMap = new Map<number, Diagnostic>();
  diagnostics.forEach(d => {
    if (!diagMap.has(d.line)) diagMap.set(d.line, d);
  });

  // Scroll to target line if triggered externally
  useEffect(() => {
    if (targetLine && textareaRef.current) {
      const textarea = textareaRef.current;
      const targetCharPos = lines.slice(0, targetLine - 1).join('\n').length + 1;
      textarea.focus();
      textarea.setSelectionRange(targetCharPos, targetCharPos);

      // Approximate scroll
      const lineHeight = 21;
      textarea.scrollTop = Math.max(0, (targetLine - 5) * lineHeight);
      onClearTargetLine();
    }
  }, [targetLine, lines, onClearTargetLine]);

  // Handle key events: Tab, Ctrl+Enter, auto-close brackets
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onCompileShortcut();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      onChange(newCode);

      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Track cursor position
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    onCursorChange(line, col);
  };

  // Quick insertion helpers
  const insertSnippet = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = code.substring(start, end);

    const replacement = prefix + selected + suffix;
    const newCode = code.substring(0, start) + replacement + code.substring(end);
    onChange(newCode);

    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + selected.length;
    }, 0);
  };

  return (
    <div style={editorContainerStyle}>
      {/* Editor Sub-Header Toolbar */}
      <div style={editorToolbarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {fileName}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>&bull; {lines.length} lines</span>
        </div>

        {/* Quick Formatting Snippets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => insertSnippet('\\textbf{', '}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Bold (\textbf{})"
          >
            <Bold size={13} />
          </button>

          <button
            onClick={() => insertSnippet('\\textit{', '}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Italic (\textit{})"
          >
            <Italic size={13} />
          </button>

          <button
            onClick={() => insertSnippet('\\begin{equation}\n  ', '\n\\end{equation}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Display Equation"
          >
            <Sigma size={13} />
          </button>

          <button
            onClick={() => insertSnippet('\\frac{', '}{}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Fraction (\frac{}{})"
          >
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>a/b</span>
          </button>

          <button
            onClick={() => insertSnippet('\\cite{', '}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Citation (\cite{})"
          >
            <Quote size={13} />
          </button>

          <button
            onClick={() => insertSnippet('\\begin{itemize}\n  \\item ', '\n\\end{itemize}')}
            className="btn-ghost"
            style={toolBtnStyle}
            title="Itemize List"
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* Editor Body: Line Gutters + Code Area */}
      <div style={editorBodyStyle}>
        {/* Line Numbers & Diagnostic Gutters */}
        <div style={gutterStyle}>
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const diag = diagMap.get(lineNum);
            const peerHere = peers.find(p => p.activeFile === fileName && p.cursorLine === lineNum);

            return (
              <div key={lineNum} style={gutterRowStyle}>
                {/* Diagnostic Marker */}
                <div style={markerAreaStyle}>
                  {diag && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: diag.severity === 'error' ? '#f43f5e' : diag.severity === 'warning' ? '#f59e0b' : '#38bdf8',
                        display: 'inline-block',
                      }}
                      title={`Line ${lineNum}: ${diag.message}`}
                    />
                  )}
                </div>

                {/* Line Number */}
                <span style={{
                  color: diag ? (diag.severity === 'error' ? '#f43f5e' : '#f59e0b') : 'var(--text-faint)',
                  fontWeight: diag ? 700 : 400
                }}>
                  {lineNum}
                </span>

                {/* Multiplayer Cursor Line Indicator */}
                {peerHere && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      width: 2,
                      height: '100%',
                      backgroundColor: peerHere.color,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Textarea Input & Multiplayer Floating Overlay */}
        <div style={{ position: 'relative', flex: 1, height: '100%' }}>
          {/* Peer Cursors Overlay */}
          {peers
            .filter(p => p.activeFile === fileName)
            .map(p => {
              const topOffset = (p.cursorLine - 1) * 21;
              return (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    top: topOffset,
                    left: 12 + Math.min(p.cursorCol * 8, 400),
                    pointerEvents: 'none',
                    zIndex: 20,
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  {/* Animated Caret */}
                  <div
                    style={{
                      width: 2,
                      height: 18,
                      backgroundColor: p.color,
                      boxShadow: `0 0 8px ${p.color}`,
                    }}
                  />
                  {/* Name Tag */}
                  <div
                    style={{
                      backgroundColor: p.color,
                      color: '#ffffff',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 3,
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </div>
                </div>
              );
            })}

          {/* Core Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            spellCheck={false}
            style={textareaStyle}
          />
        </div>
      </div>
    </div>
  );
};

const editorContainerStyle: React.CSSProperties = {
  flex: 1,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--bg-app)',
  overflow: 'hidden',
};

const editorToolbarStyle: React.CSSProperties = {
  height: 36,
  backgroundColor: 'var(--bg-surface-0)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  flexShrink: 0,
};

const toolBtnStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 'var(--radius-xs)',
  color: 'var(--text-secondary)',
};

const editorBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  position: 'relative',
};

const gutterStyle: React.CSSProperties = {
  width: 54,
  backgroundColor: 'var(--bg-surface-0)',
  borderRight: '1px solid var(--border-subtle)',
  paddingTop: 10,
  userSelect: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: '21px',
  overflow: 'hidden',
  flexShrink: 0,
};

const gutterRowStyle: React.CSSProperties = {
  height: 21,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: 8,
  position: 'relative',
};

const markerAreaStyle: React.CSSProperties = {
  position: 'absolute',
  left: 6,
  display: 'flex',
  alignItems: 'center',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: '21px',
  padding: '10px 14px',
  resize: 'none',
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  overflowX: 'auto',
  tabSize: 2,
};
