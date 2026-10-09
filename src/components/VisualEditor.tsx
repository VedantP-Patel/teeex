import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import {
  Heading1,
  Heading2,
  Bold,
  Sigma,
  Quote,
  Image as ImageIcon,
  List as ListIcon,
  Plus,
  Trash2,
  Check,
  Sparkles,
  BookOpen,
  ArrowUp,
  ArrowDown,
  FileCode,
  Search
} from 'lucide-react';
import type { Collaborator, ProjectRole, ProjectFile } from '../types/latex';
import type { BibEntry } from '../services/bibtexParser';
import {
  parseLatexToVisualBlocks,
  serializeVisualDocToLatex,
  type VisualBlock,
  type ParsedVisualDoc
} from '../services/visualLatexParser';

interface Props {
  code: string;
  fileName: string;
  onChange: (newCode: string) => void;
  files?: ProjectFile[];
  bibEntries?: BibEntry[];
  role?: ProjectRole;
  peers?: Collaborator[];
  onSwitchToCode: () => void;
}

export const VisualEditor: React.FC<Props> = ({
  code,
  fileName,
  onChange,
  files = [],
  bibEntries = [],
  role = 'owner',
  peers = [],
  onSwitchToCode,
}) => {
  // Parsed Visual Document State
  const [doc, setDoc] = useState<ParsedVisualDoc>(() => parseLatexToVisualBlocks(code));
  const [editingEquationId, setEditingEquationId] = useState<string | null>(null);
  const [equationDraft, setEquationDraft] = useState<string>('');
  const [activeCiteBlockId, setActiveCiteBlockId] = useState<string | null>(null);
  const [bibSearchQuery, setBibSearchQuery] = useState<string>('');

  // Keep internal doc in sync with external code changes (e.g. from compilation or code switch)
  const lastEmittedCodeRef = useRef<string>(code);
  useEffect(() => {
    if (code !== lastEmittedCodeRef.current) {
      setDoc(parseLatexToVisualBlocks(code));
      lastEmittedCodeRef.current = code;
    }
  }, [code]);

  const isBibFile = fileName.endsWith('.bib');

  // Emit updated LaTeX to parent
  const emitDocChange = (updatedDoc: ParsedVisualDoc) => {
    setDoc(updatedDoc);
    const newLatex = serializeVisualDocToLatex(updatedDoc);
    lastEmittedCodeRef.current = newLatex;
    onChange(newLatex);
  };

  // Block Mutation Handlers
  const handleUpdateTitle = (newTitle: string) => {
    emitDocChange({ ...doc, title: newTitle });
  };

  const handleUpdateAuthors = (newAuthors: string) => {
    emitDocChange({ ...doc, authors: newAuthors });
  };

  const handleUpdateBlockContent = (id: string, newContent: string) => {
    const updated = doc.blocks.map(b => (b.id === id ? { ...b, content: newContent, title: b.type === 'heading' ? newContent : b.title } : b));
    emitDocChange({ ...doc, blocks: updated });
  };

  const handleUpdateBlockHeadingLevel = (id: string, level: 1 | 2 | 3) => {
    const updated = doc.blocks.map(b => (b.id === id ? { ...b, headingLevel: level } : b));
    emitDocChange({ ...doc, blocks: updated });
  };

  const handleDeleteBlock = (id: string) => {
    const updated = doc.blocks.filter(b => b.id !== id);
    emitDocChange({ ...doc, blocks: updated });
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= doc.blocks.length) return;
    const blocksCopy = [...doc.blocks];
    const [moved] = blocksCopy.splice(index, 1);
    blocksCopy.splice(targetIdx, 0, moved);
    emitDocChange({ ...doc, blocks: blocksCopy });
  };

  // Add New Blocks
  const handleAddBlock = (type: VisualBlock['type'], extra?: Partial<VisualBlock>) => {
    const newBlock: VisualBlock = {
      id: `vb-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      content: extra?.content || (type === 'heading' ? 'New Section' : type === 'equation' ? '\\sum_{k=1}^n x_k = 0' : 'Enter paragraph text here...'),
      headingLevel: extra?.headingLevel || 1,
      items: extra?.items || (type === 'list' ? ['First list item', 'Second list item'] : undefined),
      ordered: extra?.ordered || false,
      caption: extra?.caption || (type === 'figure' ? 'Figure description.' : undefined),
      filename: extra?.filename || (type === 'figure' ? 'figures/architecture.png' : undefined),
      label: extra?.label || '',
    };
    emitDocChange({ ...doc, blocks: [...doc.blocks, newBlock] });
  };

  // Equation Editor Popover Handlers
  const handleStartEditEquation = (block: VisualBlock) => {
    setEditingEquationId(block.id);
    setEquationDraft(block.content);
  };

  const handleSaveEquation = (blockId: string) => {
    handleUpdateBlockContent(blockId, equationDraft);
    setEditingEquationId(null);
  };

  // List Item Handlers
  const handleUpdateListItem = (blockId: string, itemIdx: number, text: string) => {
    const updated = doc.blocks.map(b => {
      if (b.id !== blockId || !b.items) return b;
      const newItems = [...b.items];
      newItems[itemIdx] = text;
      return { ...b, items: newItems };
    });
    emitDocChange({ ...doc, blocks: updated });
  };

  const handleAddListItem = (blockId: string) => {
    const updated = doc.blocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, items: [...(b.items || []), 'New bullet point item'] };
    });
    emitDocChange({ ...doc, blocks: updated });
  };

  const handleRemoveListItem = (blockId: string, itemIdx: number) => {
    const updated = doc.blocks.map(b => {
      if (b.id !== blockId || !b.items) return b;
      return { ...b, items: b.items.filter((_, idx) => idx !== itemIdx) };
    });
    emitDocChange({ ...doc, blocks: updated });
  };

  // Figure Caption / Filename Handlers
  const handleUpdateFigure = (blockId: string, caption: string, filename: string) => {
    const updated = doc.blocks.map(b => (b.id === blockId ? { ...b, caption, filename } : b));
    emitDocChange({ ...doc, blocks: updated });
  };

  // Insert Citation into active paragraph
  const handleInsertCitation = (blockId: string, citeKey: string) => {
    const targetBlock = doc.blocks.find(b => b.id === blockId);
    if (!targetBlock) return;
    const newContent = `${targetBlock.content} \\cite{${citeKey}}`;
    handleUpdateBlockContent(blockId, newContent);
    setActiveCiteBlockId(null);
  };

  // Render Math with KaTeX Helper
  const renderMathHtml = (latexCode: string, display = true) => {
    try {
      return katex.renderToString(latexCode.trim(), {
        displayMode: display,
        throwOnError: false,
      });
    } catch {
      return `<span style="color: #f43f5e">[LaTeX Math Error: ${latexCode}]</span>`;
    }
  };

  // Helper to format inline LaTeX ($math$ and \cite{}) inside visual paragraphs
  const renderFormattedParagraph = (text: string) => {
    // Replace citations
    let processed = text.replace(/\\cite\{([^}]+)\}/g, (_, key) => {
      const bib = bibEntries.find(b => b.key === key);
      const label = bib ? `[${key}] ${bib.author.split(' ')[0]} et al.` : `[${key}]`;
      return `<span class="latex-citation-badge" title="${bib ? bib.title : key}">${label}</span>`;
    });

    // Replace inline math $...$
    processed = processed.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, math) => {
      try {
        return `<span class="latex-inline-math-pill">${katex.renderToString(math, { displayMode: false, throwOnError: false })}</span>`;
      } catch {
        return `$${math}$`;
      }
    });

    // Replace bold, italic, code
    processed = processed
      .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
      .replace(/\\texttt\{([^}]+)\}/g, '<code>$1</code>');

    return processed;
  };

  // BIB FILE VISUAL CARDS VIEW
  if (isBibFile) {
    return (
      <div style={visualContainerStyle}>
        {/* BibTeX Header */}
        <div style={visualRibbonStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <BookOpen size={14} color="#38bdf8" /> BibTeX Bibliography Visual Cards
            </span>
            <span className="badge badge-cyan" style={{ fontSize: 10 }}>{bibEntries.length} References</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={onSwitchToCode}
              className="btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)' }}
              title="Switch to raw BibTeX code"
            >
              <FileCode size={12} /> View Raw .bib
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'var(--bg-surface-0)' }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search references by title, author, or cite key..."
            value={bibSearchQuery}
            onChange={e => setBibSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          />
        </div>

        {/* References List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bibEntries
            .filter(b => !bibSearchQuery || b.title.toLowerCase().includes(bibSearchQuery.toLowerCase()) || b.author.toLowerCase().includes(bibSearchQuery.toLowerCase()) || b.key.toLowerCase().includes(bibSearchQuery.toLowerCase()))
            .map(entry => (
              <div key={entry.key} style={bibCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-cyan" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      \{entry.key}
                    </span>
                    <span className="badge" style={{ fontSize: 9.5, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                      @{entry.type.toUpperCase()}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.year}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {entry.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {entry.author}
                </div>
                {entry.journal && (
                  <div style={{ fontSize: 11, color: 'var(--accent-cyan)', fontStyle: 'italic' }}>
                    {entry.journal}
                  </div>
                )}
                {entry.booktitle && (
                  <div style={{ fontSize: 11, color: '#10b981', fontStyle: 'italic' }}>
                    In Proc. {entry.booktitle}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    );
  }

  // STANDARD LATEX DOCUMENT VISUAL EDITOR VIEW
  return (
    <div style={visualContainerStyle}>
      {/* Overleaf-Style Visual Action Ribbon */}
      <div style={visualRibbonStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginRight: 4 }}>
            INSERT:
          </div>

          <button
            onClick={() => handleAddBlock('heading', { headingLevel: 1 })}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert Section (\section{})"
          >
            <Heading1 size={13} color="#38bdf8" />
            <span>Section</span>
          </button>

          <button
            onClick={() => handleAddBlock('heading', { headingLevel: 2 })}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert Subsection (\subsection{})"
          >
            <Heading2 size={13} color="#38bdf8" />
            <span>Subsection</span>
          </button>

          <button
            onClick={() => handleAddBlock('paragraph')}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert Paragraph"
          >
            <Bold size={13} />
            <span>Paragraph</span>
          </button>

          <button
            onClick={() => handleAddBlock('equation')}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert Display Equation (\begin{equation})"
          >
            <Sigma size={13} color="#10b981" />
            <span>Equation</span>
          </button>

          <button
            onClick={() => handleAddBlock('figure')}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert Figure (\begin{figure})"
          >
            <ImageIcon size={13} color="#f59e0b" />
            <span>Figure</span>
          </button>

          <button
            onClick={() => handleAddBlock('list')}
            className="btn-ghost"
            style={ribbonBtnStyle}
            title="Insert List (\begin{itemize})"
          >
            <ListIcon size={13} />
            <span>List</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {peers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
              {peers.slice(0, 3).map(p => (
                <div
                  key={p.id}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: p.color,
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={`${p.name} active in Visual Editor`}
                >
                  {p.avatar}
                </div>
              ))}
            </div>
          )}
          <span className="badge badge-cyan" style={{ fontSize: 9.5 }}>
            <Sparkles size={10} style={{ marginRight: 3 }} /> Visual Sync Active
          </span>
        </div>
      </div>

      {/* Main Document Canvas */}
      <div style={canvasScrollStyle}>
        <div style={documentPageStyle}>
          {/* Paper Preamble / Header Card */}
          <div style={preambleCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="badge badge-cyan" style={{ fontSize: 9.5 }}>
                DOCUMENT PREAMBLE &bull; {doc.documentClass.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                LaTeX Document Structure
              </span>
            </div>

            {/* Editable Title */}
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>PAPER TITLE (\title)</label>
              <input
                type="text"
                value={doc.title}
                onChange={e => handleUpdateTitle(e.target.value)}
                placeholder="Enter publication paper title..."
                style={titleInputStyle}
              />
            </div>

            {/* Editable Authors */}
            <div>
              <label style={labelStyle}>AUTHORS &amp; AFFILIATIONS (\author)</label>
              <input
                type="text"
                value={doc.authors}
                onChange={e => handleUpdateAuthors(e.target.value)}
                placeholder="Dr. Elena Rostova and Dr. Marcus Chen..."
                style={authorsInputStyle}
              />
            </div>
          </div>

          {/* Document Blocks Stream */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {doc.blocks.map((block, idx) => (
              <div key={block.id} style={blockContainerStyle} className="visual-block-item">
                {/* Block Controls Header (Visible on hover) */}
                <div style={blockControlsStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={blockTypePillStyle}>
                      {block.type === 'heading'
                        ? `H${block.headingLevel || 1} ${block.headingLevel === 1 ? 'SECTION' : block.headingLevel === 2 ? 'SUBSECTION' : 'SUBSUBSECTION'}`
                        : block.type.toUpperCase()}
                    </span>

                    {/* Change Heading Level */}
                    {block.type === 'heading' && (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateBlockHeadingLevel(block.id, 1)}
                          style={{ ...levelBtnStyle, color: block.headingLevel === 1 ? '#38bdf8' : 'var(--text-muted)' }}
                          title="Set as Section (H1)"
                        >
                          H1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateBlockHeadingLevel(block.id, 2)}
                          style={{ ...levelBtnStyle, color: block.headingLevel === 2 ? '#38bdf8' : 'var(--text-muted)' }}
                          title="Set as Subsection (H2)"
                        >
                          H2
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateBlockHeadingLevel(block.id, 3)}
                          style={{ ...levelBtnStyle, color: block.headingLevel === 3 ? '#38bdf8' : 'var(--text-muted)' }}
                          title="Set as Subsubsection (H3)"
                        >
                          H3
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Add Citation button for paragraphs */}
                    {block.type === 'paragraph' && (
                      <button
                        type="button"
                        onClick={() => setActiveCiteBlockId(activeCiteBlockId === block.id ? null : block.id)}
                        style={iconBtnStyle}
                        title="Insert Citation \cite{...}"
                      >
                        <Quote size={12} color="#38bdf8" />
                      </button>
                    )}

                    {/* Move Up */}
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(idx, 'up')}
                        style={iconBtnStyle}
                        title="Move Block Up"
                      >
                        <ArrowUp size={12} />
                      </button>
                    )}

                    {/* Move Down */}
                    {idx < doc.blocks.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(idx, 'down')}
                        style={iconBtnStyle}
                        title="Move Block Down"
                      >
                        <ArrowDown size={12} />
                      </button>
                    )}

                    {/* Delete Block */}
                    <button
                      type="button"
                      onClick={() => handleDeleteBlock(block.id)}
                      style={{ ...iconBtnStyle, color: '#f43f5e' }}
                      title="Delete Block"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Inline Citation Picker for this paragraph */}
                {activeCiteBlockId === block.id && (
                  <div style={citePickerBoxStyle}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                      SELECT CITATION TO INSERT:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                      {bibEntries.map(b => (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => handleInsertCitation(block.id, b.key)}
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          title={`${b.title} (${b.author})`}
                        >
                          <Quote size={10} color="#38bdf8" />
                          <span style={{ fontWeight: 600 }}>{b.key}</span>
                          <span style={{ opacity: 0.7 }}>&bull; {b.author.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* BLOCK CONTENT RENDERERS */}

                {/* 1. ABSTRACT BLOCK */}
                {block.type === 'abstract' && (
                  <div style={abstractBoxStyle}>
                    <div style={abstractTitleStyle}>ABSTRACT</div>
                    <textarea
                      value={block.content}
                      onChange={e => handleUpdateBlockContent(block.id, e.target.value)}
                      style={abstractTextareaStyle}
                      rows={4}
                      placeholder="Enter paper abstract summary..."
                    />
                  </div>
                )}

                {/* 2. HEADING BLOCK */}
                {block.type === 'heading' && (
                  <div>
                    <input
                      type="text"
                      value={block.content}
                      onChange={e => handleUpdateBlockContent(block.id, e.target.value)}
                      style={{
                        ...headingInputStyle,
                        fontSize: block.headingLevel === 1 ? 18 : block.headingLevel === 2 ? 15 : 13.5,
                        fontWeight: 700,
                        color: block.headingLevel === 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                      placeholder="Section Title..."
                    />
                  </div>
                )}

                {/* 3. PARAGRAPH BLOCK */}
                {block.type === 'paragraph' && (
                  <div>
                    <textarea
                      value={block.content}
                      onChange={e => handleUpdateBlockContent(block.id, e.target.value)}
                      style={paragraphTextareaStyle}
                      rows={Math.max(2, Math.ceil(block.content.length / 85))}
                      placeholder="Type LaTeX paragraph text here... (supports $math$ and \cite{key})"
                    />
                    {/* Rendered Live Rich Text Preview below text box */}
                    {(block.content.includes('$') || block.content.includes('\\cite{') || block.content.includes('\\textbf{')) && (
                      <div
                        style={renderedPreviewPillStyle}
                        dangerouslySetInnerHTML={{ __html: renderFormattedParagraph(block.content) }}
                      />
                    )}
                  </div>
                )}

                {/* 4. EQUATION BLOCK */}
                {block.type === 'equation' && (
                  <div style={equationBoxStyle}>
                    <div
                      style={katexEquationDisplayStyle}
                      onClick={() => handleStartEditEquation(block)}
                      title="Click to edit LaTeX math formula"
                      dangerouslySetInnerHTML={{ __html: renderMathHtml(block.content, true) }}
                    />

                    {editingEquationId === block.id ? (
                      /* Inline Formula Editor Popover */
                      <div style={formulaEditorBoxStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                            EDIT LATEX FORMULA
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>KaTeX Live Preview</span>
                        </div>

                        <input
                          type="text"
                          value={equationDraft}
                          onChange={e => setEquationDraft(e.target.value)}
                          style={formulaInputStyle}
                          autoFocus
                          placeholder="e.g. \mathcal{L} = \sum_{i=1}^N x_i^2"
                        />

                        {/* Quick formula chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                          {['\\frac{a}{b}', '\\sum_{i=1}^n', '\\int_0^\\infty', '\\sqrt{x}', '\\alpha', '\\beta', '\\theta', '\\mathcal{L}'].map(chip => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => setEquationDraft(prev => `${prev} ${chip}`)}
                              style={formulaChipStyle}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleSaveEquation(block.id)}
                            className="btn-primary"
                            style={{ fontSize: 11, height: 28, padding: '0 10px' }}
                          >
                            <Check size={12} /> Apply Formula
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEquationId(null)}
                            className="btn-secondary"
                            style={{ fontSize: 11, height: 28, padding: '0 8px' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleStartEditEquation(block)}
                          className="btn-ghost"
                          style={{ fontSize: 10.5, color: 'var(--accent-cyan)', padding: '2px 8px' }}
                        >
                          <Sigma size={11} style={{ marginRight: 4 }} /> Edit Formula
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. FIGURE BLOCK */}
                {block.type === 'figure' && (() => {
                  const matchedImg = files.find(f => f.name === block.filename || f.name.includes(block.filename || ''));
                  return (
                    <div style={figureBoxStyle}>
                      {matchedImg?.dataUrl && (
                        <div style={{ textAlign: 'center', marginBottom: 10 }}>
                          <img
                            src={matchedImg.dataUrl}
                            alt={block.caption || 'Figure'}
                            style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 4, objectFit: 'contain' }}
                          />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <ImageIcon size={16} color="#f59e0b" />
                        <input
                          type="text"
                          value={block.filename || 'figure.png'}
                          onChange={e => handleUpdateFigure(block.id, block.caption || '', e.target.value)}
                          placeholder="Path to figure (e.g. figures/diagram.png)"
                          style={figureFilenameInputStyle}
                          disabled={role === 'viewer'}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
                          Caption:
                        </span>
                        <input
                          type="text"
                          value={block.caption || ''}
                          onChange={e => handleUpdateFigure(block.id, e.target.value, block.filename || '')}
                          placeholder="Enter figure caption description..."
                          style={figureCaptionInputStyle}
                          disabled={role === 'viewer'}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* 6. LIST BLOCK */}
                {block.type === 'list' && (
                  <div style={listBoxStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(block.items || []).map((item, itemIdx) => (
                        <div key={itemIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', width: 14 }}>
                            {block.ordered ? `${itemIdx + 1}.` : '•'}
                          </span>
                          <input
                            type="text"
                            value={item}
                            onChange={e => handleUpdateListItem(block.id, itemIdx, e.target.value)}
                            style={listItemInputStyle}
                            placeholder="List item text..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveListItem(block.id, itemIdx)}
                            style={{ ...iconBtnStyle, color: 'var(--text-muted)' }}
                            title="Remove item"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddListItem(block.id)}
                      className="btn-ghost"
                      style={{ marginTop: 8, fontSize: 10.5, color: 'var(--accent-cyan)', alignSelf: 'flex-start' }}
                    >
                      <Plus size={11} style={{ marginRight: 4 }} /> Add List Item
                    </button>
                  </div>
                )}

                {/* 7. RAW LATEX FALLBACK */}
                {block.type === 'raw' && (
                  <div style={rawLatexBoxStyle}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                      RAW LATEX BLOCK
                    </div>
                    <textarea
                      value={block.content}
                      onChange={e => handleUpdateBlockContent(block.id, e.target.value)}
                      style={rawTextareaStyle}
                      rows={Math.max(2, Math.ceil(block.content.length / 80))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom Add Section Action */}
          <div style={{ marginTop: 24, padding: '16px 0', borderTop: '1px dashed var(--border-subtle)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={() => handleAddBlock('paragraph')}
              className="btn-secondary"
              style={{ fontSize: 11.5, padding: '6px 12px' }}
            >
              <Plus size={12} /> Add Paragraph
            </button>
            <button
              onClick={() => handleAddBlock('heading', { headingLevel: 1 })}
              className="btn-secondary"
              style={{ fontSize: 11.5, padding: '6px 12px' }}
            >
              <Heading1 size={12} color="#38bdf8" /> Add Section
            </button>
            <button
              onClick={() => handleAddBlock('equation')}
              className="btn-secondary"
              style={{ fontSize: 11.5, padding: '6px 12px' }}
            >
              <Sigma size={12} color="#10b981" /> Add Equation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ================= STYLES =================

const visualContainerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: 'var(--bg-surface-0)',
  overflow: 'hidden',
};

const visualRibbonStyle: React.CSSProperties = {
  height: 38,
  backgroundColor: 'var(--bg-surface-1)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  flexShrink: 0,
};

const ribbonBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
};

const canvasScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px 20px',
  display: 'flex',
  justifyContent: 'center',
};

const documentPageStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 780,
  backgroundColor: 'var(--bg-surface-1)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  padding: '28px 32px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
  display: 'flex',
  flexDirection: 'column',
};

const preambleCardStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-subtle)',
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.04em',
  marginBottom: 4,
};

const titleInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  padding: '4px 0',
  outline: 'none',
};

const authorsInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  padding: '4px 0',
  outline: 'none',
};

const blockContainerStyle: React.CSSProperties = {
  position: 'relative',
  padding: '8px 12px',
  borderRadius: 'var(--radius-sm)',
  transition: 'background-color 0.15s ease',
  border: '1px solid transparent',
};

const blockControlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
  opacity: 0.6,
  transition: 'opacity 0.15s ease',
};

const blockTypePillStyle: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.04em',
};

const levelBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 10,
  fontWeight: 700,
  cursor: 'pointer',
  padding: '1px 4px',
  borderRadius: 3,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 3,
  borderRadius: 3,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
};

const abstractBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(56, 189, 248, 0.03)',
  borderLeft: '3px solid #38bdf8',
};

const abstractTitleStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  color: '#38bdf8',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const abstractTextareaStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: 12,
  lineHeight: 1.6,
  resize: 'vertical',
  fontFamily: 'inherit',
};

const headingInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: '4px 0',
  fontFamily: 'inherit',
};

const paragraphTextareaStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: 13,
  lineHeight: 1.65,
  resize: 'none',
  fontFamily: 'inherit',
};

const renderedPreviewPillStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-subtle)',
  fontSize: 12.5,
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};

const equationBoxStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(16, 185, 129, 0.03)',
  border: '1px solid rgba(16, 185, 129, 0.2)',
  cursor: 'pointer',
};

const katexEquationDisplayStyle: React.CSSProperties = {
  overflowX: 'auto',
  padding: '6px 0',
  textAlign: 'center',
};

const formulaEditorBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
};

const formulaInputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-1)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  outline: 'none',
};

const formulaChipStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  padding: '2px 6px',
  borderRadius: 3,
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const figureBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(245, 158, 11, 0.04)',
  border: '1px solid rgba(245, 158, 11, 0.2)',
};

const figureFilenameInputStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  outline: 'none',
};

const figureCaptionInputStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
};

const listBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
};

const listItemInputStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  fontSize: 12.5,
  outline: 'none',
};

const rawLatexBoxStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
};

const rawTextareaStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11.5,
  lineHeight: 1.5,
  resize: 'none',
};

const citePickerBoxStyle: React.CSSProperties = {
  marginBottom: 8,
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
};

const bibCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
};
