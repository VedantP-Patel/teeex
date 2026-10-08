import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Wrench,
  ChevronDown,
  ChevronUp,
  Terminal,
  CheckCircle2
} from 'lucide-react';
import type { Diagnostic, SuggestedFix } from '../types/latex';

interface Props {
  diagnostics: Diagnostic[];
  onApplyFix: (fix: SuggestedFix) => void;
  onJumpToLine: (line: number) => void;
  rawLogs: string[];
}

export const DiagnosticsDock: React.FC<Props> = ({
  diagnostics,
  onApplyFix,
  onJumpToLine,
  rawLogs,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'logs'>('diagnostics');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  const filteredDiagnostics = diagnostics.filter(d => {
    if (severityFilter === 'error') return d.severity === 'error';
    if (severityFilter === 'warning') return d.severity === 'warning';
    return true;
  });

  return (
    <div style={{
      ...dockContainerStyle,
      height: isCollapsed ? 32 : 180,
    }}>
      {/* Dock Header Bar */}
      <div style={dockHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setActiveTab('diagnostics')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'diagnostics' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'diagnostics' ? '2px solid #38bdf8' : '2px solid transparent',
            }}
          >
            <span style={{ fontWeight: 600 }}>Diagnostics & Suggestions</span>
            {errors.length > 0 && <span className="badge badge-rose">{errors.length} errors</span>}
            {warnings.length > 0 && <span className="badge badge-amber">{warnings.length} warnings</span>}
            {diagnostics.length === 0 && <span className="badge badge-emerald">0 issues</span>}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            style={{
              ...tabBtnStyle,
              color: activeTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'logs' ? '2px solid #38bdf8' : '2px solid transparent',
            }}
          >
            <Terminal size={12} />
            <span>Raw TeX Log</span>
          </button>
        </div>

        {/* Severity Filter & Collapse Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTab === 'diagnostics' && !isCollapsed && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setSeverityFilter('all')}
                style={{
                  ...filterBtnStyle,
                  backgroundColor: severityFilter === 'all' ? 'var(--bg-surface-2)' : 'transparent',
                }}
              >
                All ({diagnostics.length})
              </button>
              <button
                onClick={() => setSeverityFilter('error')}
                style={{
                  ...filterBtnStyle,
                  backgroundColor: severityFilter === 'error' ? 'var(--bg-surface-2)' : 'transparent',
                  color: '#f43f5e',
                }}
              >
                Errors ({errors.length})
              </button>
              <button
                onClick={() => setSeverityFilter('warning')}
                style={{
                  ...filterBtnStyle,
                  backgroundColor: severityFilter === 'warning' ? 'var(--bg-surface-2)' : 'transparent',
                  color: '#f59e0b',
                }}
              >
                Warnings ({warnings.length})
              </button>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="btn-ghost"
            style={{ padding: 4 }}
            title={isCollapsed ? 'Expand Diagnostics' : 'Collapse Diagnostics'}
          >
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      {!isCollapsed && (
        <div style={dockContentStyle}>
          {activeTab === 'diagnostics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px' }}>
              {filteredDiagnostics.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <span>No compilation errors or syntax warnings. Document is clean and ready.</span>
                </div>
              ) : (
                filteredDiagnostics.map(d => (
                  <div key={d.id} style={diagCardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1 }}>
                      {d.severity === 'error' ? (
                        <AlertCircle size={15} color="#f43f5e" style={{ flexShrink: 0, marginTop: 2 }} />
                      ) : (
                        <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <button
                            onClick={() => onJumpToLine(d.line)}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              fontWeight: 700,
                              color: d.severity === 'error' ? '#f43f5e' : '#f59e0b',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                            }}
                            title={`Jump to line ${d.line}`}
                          >
                            Line {d.line}:{d.column}
                          </button>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            [{d.rule}]
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {d.message}
                        </div>
                        {d.rawLog && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            Log: {d.rawLog}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Fix Button */}
                    {d.suggestedFix && (
                      <button
                        onClick={() => onApplyFix(d.suggestedFix!)}
                        className="btn-primary"
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          backgroundColor: '#0284c7',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                        title={d.suggestedFix.description}
                      >
                        <Wrench size={12} />
                        {d.suggestedFix.title}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {rawLogs.map((log, idx) => (
                <div key={idx} style={{ color: log.startsWith('!') ? '#f43f5e' : log.includes('Warning') ? '#f59e0b' : 'var(--text-muted)' }}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const dockContainerStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  overflow: 'hidden',
  flexShrink: 0,
  zIndex: 30,
};

const dockHeaderStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
  userSelect: 'none',
};

const tabBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  fontSize: 11.5,
  cursor: 'pointer',
};

const filterBtnStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: 'var(--radius-xs)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const dockContentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  backgroundColor: 'var(--bg-app)',
};

const diagCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 12px',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};
