'use client';
import { useState, useEffect, type InputHTMLAttributes } from 'react';
import { ArrowRight, BookOpen, Building2, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
export async function authRequest(body: Record<string, string>) {
  const r = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as { error?: string };
  if (!r.ok) throw new Error(j.error || 'Request failed.');
}
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input-wrap">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  );
}
export function LoginForm({ error, onLogin }: { error: string; onLogin: () => Promise<void> }) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<'login' | 'signup'>('login');
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lcps-remember-username');
      if (saved) {
        setUsername(saved);
        setRemember(true);
      }
    } catch {}
  }, []);
  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setErr('');
  };
  return (
    <main className="login-page auth-page login-screen">
      <a className="glass-college-logo" href="/" aria-label="LCPS home">
        <img src="/api/branding/logo" alt="Lahore College of Pharmaceutical Sciences" />
      </a>
      <section
        className={'auth-card ' + (mode === 'signup' ? 'is-signup' : '')}
        aria-label="LCPS account access"
      >
        <div className="auth-form-side">
          {mode === 'login' ? (
            <form
              className="auth-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr('');
                try {
                  await authRequest({ action: 'login', username, password });
                  try {
                    if (remember) localStorage.setItem('lcps-remember-username', username);
                    else localStorage.removeItem('lcps-remember-username');
                  } catch {}
                  await onLogin();
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="auth-kicker">
                <span /> ACADEMIC PORTAL
              </div>
              <h1>Login</h1>
              <p className="auth-description">Welcome back please login to your account</p>
              <label className="field">
                <span>Username</span>
                <input
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <PasswordInput
                  aria-label="Password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </label>
              <label className="remember-option">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    if (!e.target.checked)
                      try {
                        localStorage.removeItem('lcps-remember-username');
                      } catch {}
                  }}
                />
                Remember me
              </label>
              {(err || error) && (
                <p role="alert" className="form-error">
                  {err || error}
                </p>
              )}
              <button className="btn primary full auth-submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Login'}
              </button>
              <p className="auth-footnote">
                Don’t have an account?{' '}
                <button
                  type="button"
                  className="auth-signup-link"
                  onClick={() => switchMode('signup')}
                >
                  Signup
                </button>
              </p>
              <a className="auth-setup" href="/setup">
                First-time administrator setup
              </a>
            </form>
          ) : (
            <div className="auth-form auth-signup">
              <div className="auth-kicker">
                <span /> JOIN THE LCPS COMMUNITY
              </div>
              <h1>Get your account</h1>
              <p className="auth-description">
                Your college account is set up by the people responsible for your department.
              </p>
              <div className="account-path">
                <span className="account-icon"></span>
                <div>
                  <strong>Student account</strong>
                  <p>Contact your department’s Head of Department to request an account.</p>
                </div>
              </div>
              <div className="account-path">
                <span className="account-icon"></span>
                <div>
                  <strong>Teacher or staff account</strong>
                  <p>Ask your department HOD or college administrator to create your account.</p>
                </div>
              </div>
              <button className="btn" onClick={() => switchMode('login')}>
                Back to login
              </button>
              <div className="account-security">
                <span>
                  Accounts are created by authorized college staff to keep the learning portal
                  secure.
                </span>
              </div>
            </div>
          )}
        </div>
        <aside className="auth-promo campus-promo" aria-label="LCPS campus">
          <div className="campus-caption">
            <span>LAHORE COLLEGE OF PHARMACEUTICAL SCIENCES</span>
            <h2>Learning starts here.</h2>
            <p>Your classes, coursework and academic progress. Connected.</p>
          </div>
        </aside>
      </section>
      <small className="powered-login">Powered by A &amp; U</small>
    </main>
  );
}
export function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirm) {
          setError('New passwords do not match.');
          return;
        }
        setBusy(true);
        try {
          await authRequest({ action: 'change', currentPassword, newPassword });
          onChanged();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {[
        ['Current password', currentPassword, setCurrent],
        ['New password', newPassword, setNew],
        ['Confirm new password', confirm, setConfirm],
      ].map(([label, value, set], i) => (
        <label className="field" key={String(label)}>
          <span>{String(label)}</span>
          <PasswordInput
            aria-label={String(label)}
            autoComplete={i ? 'new-password' : 'current-password'}
            minLength={i ? 10 : undefined}
            maxLength={128}
            required
            value={String(value)}
            onChange={(e) => (set as (v: string) => void)(e.target.value)}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
