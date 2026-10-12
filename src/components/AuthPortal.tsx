import React, { useState } from 'react';
import {
  Shield,
  Mail,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Layers,
  FileCode2,
  LockKeyhole
} from 'lucide-react';
import type { UserProfile } from '../types/latex';
import {
  loginWithEmail,
  signUpWithEmail,
  requestPasswordReset,
  DEMO_ACCOUNTS
} from '../services/authService';
import {
  isPlatformDeveloper,
  unlockPlatformDeveloper,
  isDemoModeEnabled,
  setDemoModeEnabled
} from '../services/developerService';

interface Props {
  onAuthSuccess: (user: UserProfile) => void;
  onDeveloperStatusChanged?: () => void;
}

type AuthTab = 'signin' | 'signup' | 'forgot';

export const AuthPortal: React.FC<Props> = ({
  onAuthSuccess,
  onDeveloperStatusChanged,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Developer clearance controls
  const [isDev, setIsDev] = useState(() => isPlatformDeveloper());
  const [demoVisible, setDemoVisible] = useState(() => isDemoModeEnabled());
  const [showDevPrompt, setShowDevPrompt] = useState(false);
  const [devPasscode, setDevPasscode] = useState('');
  const [devError, setDevError] = useState<string | null>(null);

  const handleDevUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const res = unlockPlatformDeveloper(devPasscode);
    if (res.success) {
      setIsDev(true);
      setDemoVisible(true);
      setDemoModeEnabled(true);
      setShowDevPrompt(false);
      setDevPasscode('');
      setDevError(null);
      onDeveloperStatusChanged?.();
    } else {
      setDevError(res.error || 'Invalid developer passcode');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await loginWithEmail(email, password, rememberMe);
      if (res.success && res.user) {
        setSuccessMessage('Authentication verified. Launching studio workspace...');
        setTimeout(() => {
          onAuthSuccess(res.user!);
        }, 400);
      } else {
        setErrorMessage(res.error || 'Invalid credentials.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setErrorMessage('Please fill in all required registration fields.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters in length.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await signUpWithEmail(email, password, fullName, rememberMe);
      if (res.success && res.user) {
        setSuccessMessage('Account registered successfully! Loading workspace...');
        setTimeout(() => {
          onAuthSuccess(res.user!);
        }, 450);
      } else {
        setErrorMessage(res.error || 'Failed to create academic account.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during account registration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.error || 'Could not dispatch password reset link.');
      }
    } catch {
      setErrorMessage('Failed to send reset instructions.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = (demo: typeof DEMO_ACCOUNTS[0]) => {
    setIsLoading(true);
    setErrorMessage(null);
    setTimeout(() => {
      onAuthSuccess(demo.profile);
      setIsLoading(false);
    }, 200);
  };

  return (
    <div style={containerStyle}>
      {/* Background Ambient Glow Accents */}
      <div style={ambientGlowCyanStyle} />
      <div style={ambientGlowPurpleStyle} />

      {/* Main Authentication Card */}
      <div style={cardStyle}>
        {/* Card Header & Branding */}
        <div style={headerStyle}>
          <div style={badgeIconStyle}>
            <FileCode2 size={24} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <h1 style={titleStyle}>Teeex Studio</h1>
              <span style={versionBadgeStyle}>v2.4 SECURE</span>
            </div>
            <p style={subtitleStyle}>
              Real-Time Collaborative LaTeX Platform
            </p>
          </div>
        </div>

        {/* Security Assurance Banner */}
        <div style={securityBannerStyle}>
          <Shield size={13} color="#10b981" />
          <span>Encrypted Session Gate • Strict Auth Barrier Active</span>
        </div>

        {/* Tab Switcher */}
        {activeTab !== 'forgot' && (
          <div style={tabContainerStyle}>
            <button
              type="button"
              onClick={() => { setActiveTab('signin'); setErrorMessage(null); setSuccessMessage(null); }}
              style={{
                ...tabBtnStyle,
                color: activeTab === 'signin' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
                borderBottom: activeTab === 'signin' ? '2px solid #38bdf8' : '2px solid transparent',
                backgroundColor: activeTab === 'signin' ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('signup'); setErrorMessage(null); setSuccessMessage(null); }}
              style={{
                ...tabBtnStyle,
                color: activeTab === 'signup' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
                borderBottom: activeTab === 'signup' ? '2px solid #38bdf8' : '2px solid transparent',
                backgroundColor: activeTab === 'signup' ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Status Alerts */}
        <div style={{ padding: '0 28px' }}>
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
        </div>

        {/* Body Content */}
        <div style={bodyStyle}>
          {/* SIGN IN FORM */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <div style={inputWrapperStyle}>
                  <Mail size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12, flexShrink: 0 }} />
                  <input
                    type="email"
                    name="email"
                    id="signin-email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. author@university.edu"
                    className="auth-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('forgot'); setErrorMessage(null); setSuccessMessage(null); }}
                    style={forgotBtnStyle}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={inputWrapperStyle}>
                  <Lock size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12, flexShrink: 0 }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    id="signin-password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="auth-input"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={eyeBtnStyle}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} color="#94a3b8" /> : <Eye size={15} color="#94a3b8" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
                <label style={rememberLabelStyle}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ accentColor: '#38bdf8', cursor: 'pointer', width: 14, height: 14 }}
                  />
                  <span>Remember me on this device</span>
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
                  {rememberMe ? 'Persistent session' : 'Single session'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={submitBtnStyle}
              >
                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Verifying clearance...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LockKeyhole size={15} />
                    <span>Enter Studio Workspace</span>
                  </div>
                )}
              </button>
            </form>
          )}

          {/* SIGN UP FORM */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>FULL NAME / ACADEMIC TITLE</label>
                <div style={inputWrapperStyle}>
                  <User size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12 }} />
                  <input
                    type="text"
                    name="name"
                    id="signup-name"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Eleanor Vance"
                    className="auth-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>INSTITUTIONAL / RESEARCH EMAIL</label>
                <div style={inputWrapperStyle}>
                  <Mail size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12 }} />
                  <input
                    type="email"
                    name="email"
                    id="signup-email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. evance@oxford.ac.uk"
                    className="auth-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>CREATE PASSWORD</label>
                <div style={inputWrapperStyle}>
                  <Lock size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12 }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    id="signup-password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="auth-input"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={eyeBtnStyle}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} color="#94a3b8" /> : <Eye size={15} color="#94a3b8" />}
                  </button>
                </div>
              </div>

              <label style={rememberLabelStyle}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer', width: 14, height: 14 }}
                />
                <span>Remember me on this browser</span>
              </label>

              <button
                type="submit"
                disabled={isLoading}
                style={submitBtnStyle}
              >
                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Registering credentials...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={15} />
                    <span>Create Academic Account</span>
                  </div>
                )}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {activeTab === 'forgot' && (
            <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.6, margin: 0 }}>
                Enter your registered email address below. We will send you secure instructions to reset your account password.
              </p>

              <div>
                <label style={labelStyle}>REGISTERED EMAIL</label>
                <div style={inputWrapperStyle}>
                  <Mail size={15} color="var(--text-muted, #94a3b8)" style={{ marginLeft: 12 }} />
                  <input
                    type="email"
                    name="email"
                    id="forgot-email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. author@university.edu"
                    className="auth-input"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('signin'); setErrorMessage(null); setSuccessMessage(null); }}
                  style={cancelBtnStyle}
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{ ...submitBtnStyle, flex: 1.4 }}
                >
                  {isLoading ? (
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <KeyRound size={14} />
                      <span>Send Reset Link</span>
                    </div>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Developer Test Switcher (Strictly for Verified Platform Developer) */}
          {isDev && demoVisible && (
            <div style={demoBoxStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={13} color="#38bdf8" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', letterSpacing: '0.04em' }}>
                    DEVELOPER TEST SUITE
                  </span>
                </div>
                <span style={devBadgeStyle}>Dev Clearance Active</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DEMO_ACCOUNTS.map(demo => (
                  <button
                    key={demo.profile.id}
                    type="button"
                    onClick={() => handleQuickDemoLogin(demo)}
                    style={demoBtnStyle}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ ...avatarMiniStyle, backgroundColor: demo.profile.avatarColor }}>
                        {demo.profile.fullName.substring(0, 2).toUpperCase()}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
                          {demo.profile.fullName}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)' }}>
                          {demo.profile.email}
                        </div>
                      </div>
                    </div>
                    <span style={roleBadgeStyle(demo.role)}>
                      {demo.role.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discreet Developer Passcode Trigger */}
          {!isDev && !showDevPrompt && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setShowDevPrompt(true)}
                style={devLinkStyle}
                title="Website Developer Clearance"
              >
                Website Developer Clearance
              </button>
            </div>
          )}

          {!isDev && showDevPrompt && (
            <form onSubmit={handleDevUnlock} style={devFormStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', letterSpacing: '0.04em' }}>
                ENTER WEBSITE DEVELOPER PASSCODE
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="Enter authorized passcode"
                  value={devPasscode}
                  onChange={e => {
                    setDevPasscode(e.target.value);
                    setDevError(null);
                  }}
                  style={devInputStyle}
                  autoFocus
                />
                <button type="submit" style={devUnlockBtnStyle}>
                  Verify
                </button>
                <button type="button" onClick={() => setShowDevPrompt(false)} style={devCancelBtnStyle}>
                  Cancel
                </button>
              </div>
              {devError && (
                <div style={{ fontSize: 11, color: '#f43f5e' }}>{devError}</div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100vw',
  backgroundColor: '#070b14',
  backgroundImage: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(56, 189, 248, 0.15), rgba(255, 255, 255, 0))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const ambientGlowCyanStyle: React.CSSProperties = {
  position: 'absolute',
  width: '500px',
  height: '500px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, rgba(0, 0, 0, 0) 70%)',
  top: '10%',
  left: '15%',
  pointerEvents: 'none',
  filter: 'blur(40px)',
};

const ambientGlowPurpleStyle: React.CSSProperties = {
  position: 'absolute',
  width: '550px',
  height: '550px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(99, 102, 241, 0.07) 0%, rgba(0, 0, 0, 0) 70%)',
  bottom: '10%',
  right: '15%',
  pointerEvents: 'none',
  filter: 'blur(50px)',
};

const cardStyle: React.CSSProperties = {
  width: '460px',
  maxWidth: '100%',
  backgroundColor: 'rgba(15, 23, 42, 0.88)',
  backdropFilter: 'blur(20px)',
  borderRadius: '16px',
  border: '1px solid rgba(56, 189, 248, 0.22)',
  boxShadow: '0 30px 70px -15px rgba(0, 0, 0, 0.85), 0 0 50px rgba(56, 189, 248, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 10,
  position: 'relative',
};

const headerStyle: React.CSSProperties = {
  padding: '28px 28px 18px 28px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 12,
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const badgeIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '12px',
  backgroundColor: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: '#f8fafc',
  margin: 0,
};

const versionBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: '9999px',
  backgroundColor: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  letterSpacing: '0.04em',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: '#94a3b8',
  margin: '4px 0 0 0',
  fontWeight: 400,
};

const securityBannerStyle: React.CSSProperties = {
  margin: '14px 28px 0 28px',
  padding: '7px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(16, 185, 129, 0.08)',
  border: '1px solid rgba(16, 185, 129, 0.22)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 11,
  fontWeight: 500,
  color: '#34d399',
};

const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  marginTop: 14,
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 0',
  background: 'none',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const bodyStyle: React.CSSProperties = {
  padding: '22px 28px 28px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: '#94a3b8',
  display: 'block',
  marginBottom: 6,
};

const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  backgroundColor: 'rgba(2, 6, 23, 0.7)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '8px',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  overflow: 'hidden',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  fontSize: 13,
  background: 'transparent',
  border: 'none',
  color: '#f8fafc',
  outline: 'none',
};

const eyeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const forgotBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#38bdf8',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  padding: 0,
};

const rememberLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  fontSize: 12,
  color: '#cbd5e1',
};

const submitBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: '8px',
  border: 'none',
  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
  color: '#ffffff',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
  transition: 'transform 0.1s ease, box-shadow 0.15s ease',
  marginTop: 4,
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 42,
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  color: '#cbd5e1',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
};

const errorBannerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(244, 63, 94, 0.12)',
  border: '1px solid rgba(244, 63, 94, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
  color: '#fb7185',
  marginTop: 14,
};

const successBannerStyle: React.CSSProperties = {
  backgroundColor: 'rgba(16, 185, 129, 0.12)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  borderRadius: '8px',
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
  color: '#34d399',
  marginTop: 14,
};

const demoBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(2, 6, 23, 0.6)',
  border: '1px solid rgba(56, 189, 248, 0.2)',
  borderRadius: '10px',
  padding: 14,
  marginTop: 4,
};

const demoBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
  width: '100%',
};

const avatarMiniStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 10,
};

const devBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
};

const roleBadgeStyle = (role: string): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: role === 'owner' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
  color: role === 'owner' ? '#38bdf8' : '#34d399',
  border: `1px solid ${role === 'owner' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
});

const devLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 11,
  color: '#64748b',
  cursor: 'pointer',
  opacity: 0.7,
  padding: '4px 8px',
};

const devFormStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '12px 14px',
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const devInputStyle: React.CSSProperties = {
  flex: 1,
  height: 34,
  padding: '0 10px',
  borderRadius: '6px',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  backgroundColor: 'rgba(2, 6, 23, 0.8)',
  color: '#f8fafc',
  fontSize: 12,
  outline: 'none',
};

const devUnlockBtnStyle: React.CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
};

const devCancelBtnStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: '6px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backgroundColor: 'transparent',
  color: '#94a3b8',
  fontSize: 11.5,
  cursor: 'pointer',
};
