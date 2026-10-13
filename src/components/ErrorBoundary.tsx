import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Teeex Studio Uncaught Exception:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleResetSession = (): void => {
    try {
      localStorage.removeItem('teeex_active_session');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            width: '100vw',
            backgroundColor: '#070b14',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            boxSizing: 'border-box',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#f8fafc',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 12,
              padding: '28px 32px',
              maxWidth: 500,
              width: '100%',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f43f5e',
              }}
            >
              <AlertTriangle size={24} />
            </div>

            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                Something went wrong in Teeex Studio
              </div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>
                An unexpected interface error occurred. You can reload the workspace or reset the session to recover.
              </div>
            </div>

            {this.state.error?.message && (
              <div
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#fca5a5',
                  textAlign: 'left',
                  maxHeight: 100,
                  overflow: 'auto',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 6,
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} />
                <span>Reload Workspace</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetSession}
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
