import React, { useState } from 'react';
import { X, BookOpen, Loader2, Check, AlertCircle } from 'lucide-react';
import { fetchBibtexByDoi, type FetchedCitation } from '../../services/citationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddBibtexEntry: (bibtex: string, key: string) => void;
}

export const DoiImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onAddBibtexEntry,
}) => {
  const [doiInput, setDoiInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchedCitation | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleFetch = async (targetDoi?: string) => {
    const query = targetDoi || doiInput;
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const citation = await fetchBibtexByDoi(query);
      setResult(citation);
    } catch (err: any) {
      setError(err.message || 'Failed to resolve DOI citation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppend = () => {
    if (!result) return;
    onAddBibtexEntry(result.bibtex, result.key);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 900);
  };

  const sampleDois = [
    { label: 'Attention Is All You Need (Vaswani et al.)', doi: '10.48550/arXiv.1706.03762' },
    { label: 'Quantum Supremacy (Nature)', doi: '10.1038/s41586-019-1666-5' },
    { label: 'AlphaFold (Nature)', doi: '10.1038/s41586-021-03819-2' },
  ];

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={iconBadgeStyle}>
              <BookOpen size={16} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                1-Click DOI Citation Importer
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                Fetch verified BibTeX references via CrossRef & DOI registry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Input Bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="e.g. 10.1038/s41586-021-03819-2 or https://doi.org/..."
              value={doiInput}
              onChange={e => setDoiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'var(--bg-surface-0)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
              autoFocus
            />
            <button
              onClick={() => handleFetch()}
              disabled={isLoading || !doiInput.trim()}
              className="btn-primary"
              style={{
                padding: '8px 16px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: isLoading || !doiInput.trim() ? 0.6 : 1,
              }}
            >
              {isLoading ? <Loader2 size={13} className="spin" /> : <BookOpen size={13} />}
              <span>Fetch BibTeX</span>
            </button>
          </div>

          {/* Sample quick picks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Try sample:</span>
            {sampleDois.map(s => (
              <button
                key={s.doi}
                onClick={() => {
                  setDoiInput(s.doi);
                  handleFetch(s.doi);
                }}
                className="btn-ghost"
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: '#38bdf8',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Error display */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              padding: '8px 12px',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: '#f43f5e',
              fontSize: 11.5,
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Fetched Preview Result */}
        {result && (
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            <div style={{
              backgroundColor: 'var(--bg-surface-0)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {result.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {result.author} ({result.year})
              </div>
              {result.journal && (
                <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  {result.journal}
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-cyan" style={{ fontSize: 10 }}>
                  Key: {result.key}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Use \cite&#123;{result.key}&#125; in LaTeX
                </span>
              </div>
            </div>

            {/* Raw BibTeX code */}
            <div style={{
              backgroundColor: '#05070a',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#94a3b8',
              maxHeight: 140,
              overflowY: 'auto',
              whiteSpace: 'pre',
            }}>
              {result.bibtex}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-0)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 11.5 }}>
            Cancel
          </button>
          {result && (
            <button
              onClick={handleAppend}
              className="btn-primary"
              style={{
                fontSize: 11.5,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: copied ? '#10b981' : undefined,
              }}
            >
              {copied ? <Check size={13} /> : <BookOpen size={13} />}
              <span>{copied ? 'Added to references.bib!' : 'Add to references.bib'}</span>
            </button>
          )}
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
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
  width: '100%',
  maxWidth: 540,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(56, 189, 248, 0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
