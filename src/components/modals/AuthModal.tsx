import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound
} from 'lucide-react';
import type { UserProfile } from '../../types/latex';
import {
  loginWithEmail,
  signUpWithEmail,
  requestPasswordReset,
  DEMO_ACCOUNTS
} from '../../services/authService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onAuthSuccess: (user: UserProfile) => void;
}

type AuthTab = 'signin' | 'signup' | 'forgot';

export const AuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser: _currentUser,
  onAuthSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await loginWithEmail(email, password, rememberMe);
      if (res.success && res.user) {
        setSuccessMessage('Successfully signed in.');
        setTimeout(() => {
          onAuthSuccess(res.user!);
          onClose();
        }, 350);
      } else {
        setErrorMessage(res.error || 'Invalid credentials.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setErrorMessage('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await signUpWithEmail(email, password, fullName, rememberMe);
      if (res.success && res.user) {
        setSuccessMessage('Account created successfully!');
        setTimeout(() => {
          onAuthSuccess(res.user!);
          onClose();
        }, 400);
      } else {
        setErrorMessage(res.error || 'Failed to create account.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please enter your account email.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.error || 'Could not send reset link.');
      }
    } catch {
      setErrorMessage('Failed to send reset instructions.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setIsLoading(true);
    setErrorMessage(null);
    setTimeout(() => {
      onAuthSuccess(demo.profile);
      setIsLoading(false);
      onClose();
    }, 250);
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={badgeIconStyle}>
              <Shield size={16} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {activeTab === 'signin' && 'Sign In to Teeex Studio'}
                {activeTab === 'signup' && 'Create Academic Account'}
                {activeTab === 'forgot' && 'Reset Account Password'}
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Secure access &amp; multi-project sync
              </p>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        {activeTab !== 'forgot' && (
          <div style={tabContainerStyle}>
            <button
              onClick={() => { setActiveTab('signin'); setErrorMessage(null); setSuccessMessage(null); }}
              style={{
                ...tabBtnStyle,
                borderBottom: activeTab === 'signin' ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeTab === 'signin' ? '#38bdf8' : 'var(--text-muted)',
                fontWeight: activeTab === 'signin' ? 600 : 500,
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setActiveTab('signup'); setErrorMessage(null); setSuccessMessage(null); }}
              style={{
                ...tabBtnStyle,
                borderBottom: activeTab === 'signup' ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeTab === 'signup' ? '#38bdf8' : 'var(--text-muted)',
                fontWeight: activeTab === 'signup' ? 600 : 500,
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status Banners */}
          {errorMessage && (
            <div style={errorBannerStyle}>
              <AlertCircle size={15} color="#f43f5e" style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div style={successBannerStyle}>
              <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* SIGN IN FORM */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <div style={inputWrapperStyle}>
                  <Mail size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. elena.rostova@teeex.io"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('forgot'); setErrorMessage(null); setSuccessMessage(null); }}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={inputWrapperStyle}>
                  <Lock size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Remember Me Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                  <span>Remember me on this browser</span>
                </label>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {rememberMe ? 'Persistent token' : 'Session only'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                style={{ width: '100%', height: 38, fontSize: 13, marginTop: 4 }}
              >
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign In'}
              </button>
            </form>
          )}

          {/* SIGN UP FORM */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>FULL NAME / ACADEMIC TITLE</label>
                <div style={inputWrapperStyle}>
                  <User size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Jane Doe"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <div style={inputWrapperStyle}>
                  <Mail size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane.doe@university.edu"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>CHOOSE PASSWORD</label>
                <div style={inputWrapperStyle}>
                  <Lock size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Remember Me Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span>Remember me on this browser</span>
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                style={{ width: '100%', height: 38, fontSize: 13, marginTop: 4 }}
              >
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Create Account'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enter the email address registered with your account. We will send you instructions and a secure magic link to reset your password.
              </div>

              <div>
                <label style={labelStyle}>REGISTERED EMAIL</label>
                <div style={inputWrapperStyle}>
                  <Mail size={14} color="var(--text-muted)" style={{ marginLeft: 10 }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. elena.rostova@teeex.io"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('signin'); setErrorMessage(null); setSuccessMessage(null); }}
                  className="btn-secondary"
                  style={{ flex: 1, height: 38, fontSize: 12 }}
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary"
                  style={{ flex: 1.5, height: 38, fontSize: 12 }}
                >
                  {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : (
                    <>
                      <KeyRound size={14} /> Send Reset Link
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Quick Demo Academic Switcher (Fast Role Testing) */}
          <div style={demoBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                INSTANT ROLE SWITCHER (DEVELOPER &amp; DEMO)
              </span>
              <span className="badge badge-cyan" style={{ fontSize: 10 }}>1-Click Role Switch</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DEMO_ACCOUNTS.map(demo => (
                <button
                  key={demo.profile.id}
                  type="button"
                  onClick={() => handleQuickDemoLogin(demo)}
                  style={demoBtnStyle}
                  title={`Switch active user to ${demo.profile.fullName} (${demo.role})`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...avatarMiniStyle, backgroundColor: demo.profile.avatarColor }}>
                      {demo.profile.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {demo.profile.fullName}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {demo.profile.email}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${demo.role === 'owner' ? 'badge-cyan' : demo.role === 'editor' ? 'badge-emerald' : ''}`} style={{ fontSize: 10 }}>
                    {demo.role.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>
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
  width: '460px',
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
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--bg-surface-0)',
};

const badgeIconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  padding: 4,
  borderRadius: 'var(--radius-sm)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface-0)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 0',
  background: 'none',
  border: 'none',
  fontSize: 12.5,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 5,
};

const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  transition: 'border-color 0.15s ease',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  fontSize: 12.5,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  outline: 'none',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(244, 63, 94, 0.1)',
  border: '1px solid rgba(244, 63, 94, 0.25)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: '#f43f5e',
};

const successBannerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(16, 185, 129, 0.1)',
  border: '1px solid rgba(16, 185, 129, 0.25)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: '#10b981',
};

const demoBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface-0)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 12,
};

const demoBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  backgroundColor: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  width: '100%',
};

const avatarMiniStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 9.5,
};
