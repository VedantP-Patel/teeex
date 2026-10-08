import React, { useState, useRef } from 'react';
import { Image, Upload, X, Trash2, FileCheck } from 'lucide-react';
import type { ProjectFile } from '../../types/latex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddImageFile: (file: ProjectFile) => void;
  onInsertLatex: (code: string) => void;
}

export const ImageUploadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onAddImageFile,
  onInsertLatex,
}) => {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    dataUrl: string;
    sizeKb: number;
  } | null>(null);

  const [caption, setCaption] = useState('Architectural schematics of the neural quantum state estimator.');
  const [label, setLabel] = useState('fig:network_architecture');
  const [widthRatio, setWidthRatio] = useState('0.85');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        name: file.name.replace(/\s+/g, '_'),
        dataUrl: reader.result as string,
        sizeKb: Math.round(file.size / 1024),
      });
      setLabel(`fig:${file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        name: file.name.replace(/\s+/g, '_'),
        dataUrl: reader.result as string,
        sizeKb: Math.round(file.size / 1024),
      });
      setLabel(`fig:${file.name.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    };
    reader.readAsDataURL(file);
  };

  const generateSnippet = () => {
    const fname = selectedFile ? selectedFile.name : 'figure1.png';
    return `\\begin{figure}[htbp]
\\centering
\\includegraphics[width=${widthRatio}\\linewidth]{${fname}}
\\caption{${caption}}
\\label{${label}}
\\end{figure}`;
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onAddImageFile({
        id: selectedFile.name,
        name: selectedFile.name,
        type: 'image',
        content: `[Binary Image Data: ${selectedFile.sizeKb} KB]`,
        dataUrl: selectedFile.dataUrl,
      });
    }

    onInsertLatex(generateSnippet());
    onClose();
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image size={18} color="#38bdf8" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Figure & Asset Manager</h2>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
          {/* Drag & Drop Area */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={dropZoneStyle}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img
                  src={selectedFile.dataUrl}
                  alt={selectedFile.name}
                  style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 4, backgroundColor: 'var(--bg-surface-2)' }}
                />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedFile.sizeKb} KB &bull; Image Ready</div>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="btn-ghost"
                  style={{ marginLeft: 'auto', color: 'var(--accent-rose)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Upload size={28} color="#38bdf8" />
                <div style={{ fontSize: 13, fontWeight: 600 }}>Drag and drop figure or click to browse</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Supports PNG, JPG, SVG, WebP</div>
              </div>
            )}
          </div>

          {/* Caption & Label Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>FIGURE CAPTION (\\caption)</label>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={labelStyle}>FIGURE LABEL (\\label)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Width Ratio Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={labelStyle}>SCALE (\\linewidth)</label>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{Math.round(parseFloat(widthRatio) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={widthRatio}
              onChange={e => setWidthRatio(e.target.value)}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          {/* Generated Code Preview */}
          <div>
            <label style={labelStyle}>GENERATED LATEX SNIPPET</label>
            <pre style={{
              margin: 0,
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-0)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#38bdf8',
            }}>
              {generateSnippet()}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10, backgroundColor: 'var(--bg-surface-0)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn-primary" style={{ fontSize: 12 }}>
            <FileCheck size={14} /> Insert Figure
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
  width: '600px',
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

const dropZoneStyle: React.CSSProperties = {
  border: '2px dashed var(--border-medium)',
  borderRadius: 'var(--radius-md)',
  padding: '24px 16px',
  textAlign: 'center',
  cursor: 'pointer',
  backgroundColor: 'var(--bg-surface-0)',
  transition: 'all 0.2s ease',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 4,
  letterSpacing: '0.04em',
};
