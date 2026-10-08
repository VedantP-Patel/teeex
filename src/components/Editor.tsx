import React, { useRef, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Sigma,
  Quote,
  List,
  MessageSquarePlus,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import type { Collaborator, Diagnostic, ReviewComment } from '../types/latex';

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
  comments: ReviewComment[];
  onAddComment: (line: number, text: string) => void;
  onResolveComment: (commentId: string) => void;
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
  comments,
  onAddComment,
  onResolveComment,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [currentCursorLine, setCurrentCursorLine] = useState(1);

  const lines = code.split('\n');

  // Gutter diagnostics map: line -> Diagnostic
  const diagMap = new Map<number, Diagnostic>();
  diagnostics.forEach(d => {
    if (!diagMap.has(d.line)) diagMap.set(d.line, d);
  });

  // Comments map: line -> ReviewComment[]
  const commentMap = new Map<number, ReviewComment[]>();
  comments.filter(c => !c.resolved).forEach(c => {
    const arr = commentMap.get(c.line) || [];
    arr.push(c);
    commentMap.set(c.line, arr);
  });

  // Scroll to target line if triggered externally (SyncTeX)
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
    setCurrentCursorLine(line);
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

  const submitComment = () => {
    if (!commentDraft.trim() || activeCommentLine === null) return;
    onAddComment(activeCommentLine, commentDraft.trim());
    setCommentDraft('');
    setActiveCommentLine(null);
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

        {/* Quick Formatting Snippets & Comment action */}
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

          <div style={{ width: 1, height: 14, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

          <button
            onClick={() => setActiveCommentLine(currentCursorLine)}
            className="btn-ghost"
            style={{ ...toolBtnStyle, color: '#f59e0b' }}
            title="Add inline review comment at cursor"
          >
            <MessageSquarePlus size={13} />
            <span style={{ fontSize: 10 }}>Comment</span>
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
            const lineComments = commentMap.get(lineNum);
            const peerHere = peers.find(p => p.activeFile === fileName && p.cursorLine === lineNum);

            return (
              <div key={lineNum} style={gutterRowStyle}>
                {/* Diagnostic Marker or Comment Icon */}
                <div style={markerAreaStyle}>
                  {diag ? (
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
                  ) : lineComments && lineComments.length > 0 ? (
                    <span
                      onClick={() => setActiveCommentLine(lineNum)}
                      style={{ cursor: 'pointer', display: 'flex' }}
                      title={`${lineComments.length} comment(s) on line ${lineNum}`}
                    >
                      <MessageSquare size={10} color="#f59e0b" />
                    </span>
                  ) : null}
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
                  <div
                    style={{
                      width: 2,
                      height: 18,
                      backgroundColor: p.color,
                      boxShadow: `0 0 8px ${p.color}`,
                    }}
                  />
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

          {/* Active Comment Bubble Overlay */}
          {activeCommentLine !== null && (
            <div style={{
              position: 'absolute',
              top: Math.max(10, (activeCommentLine - 1) * 21 - 10),
              right: 20,
              zIndex: 30,
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              padding: 10,
              width: 260,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                  Comment on Line {activeCommentLine}
                </span>
                <button onClick={() => setActiveCommentLine(null)} className="btn-ghost" style={{ padding: 2 }}>
                  <X size={12} />
                </button>
              </div>

              {/* Existing Comments on this line */}
              {(commentMap.get(activeCommentLine) || []).map(c => (
                <div key={c.id} style={{
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-surface-0)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  marginBottom: 6,
                  fontSize: 11,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: c.authorColor }}>{c.authorName}</span>
                    <button
                      onClick={() => onResolveComment(c.id)}
                      className="btn-ghost"
                      style={{ padding: '1px 4px', fontSize: 10, color: 'var(--text-muted)' }}
                      title="Mark as resolved"
                    >
                      <Check size={11} color="#10b981" /> Resolve
                    </button>
                  </div>
                  <div style={{ color: 'var(--text-primary)' }}>{c.text}</div>
                </div>
              ))}

              {/* New Comment Input */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  type="text"
                  placeholder="Leave comment..."
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
                  autoFocus
                />
                <button onClick={submitComment} className="btn-primary" style={{ padding: '4px 8px', fontSize: 11 }}>
                  Post
                </button>
              </div>
            </div>
          )}

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
