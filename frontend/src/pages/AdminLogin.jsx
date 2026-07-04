import { useState, useEffect, useId } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Toast, useToast } from '../components/ui';

const inputClass =
  'w-full h-11 px-3.5 bg-white text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:outline-none focus-visible:border-[var(--color-brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/20 disabled:opacity-60 disabled:cursor-not-allowed';

function consumeSignedOutFlash() {
  const raw = sessionStorage.getItem('adminSignedOut');
  if (!raw) return null;
  sessionStorage.removeItem('adminSignedOut');
  try {
    return JSON.parse(raw);
  } catch {
    return { name: null };
  }
}

export default function AdminLogin() {
  const { login, user, role, logout } = useAuth();
  const { clearToasts } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';
  const [signedOutNotice] = useState(() => consumeSignedOutFlash());

  const formId = useId();
  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    clearToasts();
  }, [clearToasts]);

  useEffect(() => {
    if (user && role === 'admin') {
      navigate(from, { replace: true });
      return;
    }

    if (user && role && role !== 'admin') {
      logout().then(() => {
        setErrorMsg('This sign-in page is for administrators only.');
      });
    }
  }, [user, role, navigate, logout, from]);

  if (user && role === 'admin') {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await login(email.trim(), password, 'admin');
      navigate(from, { replace: true });
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 sm:px-6 antialiased font-sans relative overflow-hidden bg-[#0f1729]">
      <Toast />

      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1020] via-[#121f3d] to-[#1a2d52]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(233,69,96,0.22),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(56,100,180,0.35),transparent_50%)]" />
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-accent)]/20 blur-[100px]" />
        <div className="absolute -bottom-40 right-1/4 h-[28rem] w-[28rem] rounded-full bg-[#3b5bdb]/25 blur-[120px]" />
      </div>

      <main className="relative z-10 w-full max-w-[420px]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
          <div className="border-b border-[var(--color-border-default)] bg-gradient-to-b from-white to-[var(--color-surface-panel)]/40 px-8 pb-7 pt-8 text-center">
            <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-xl bg-white p-3 shadow-[0_2px_12px_rgba(26,26,46,0.08)] ring-1 ring-black/[0.06]">
              <img src="/image.png" alt="" className="h-10 w-auto object-contain" width={120} height={40} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
              Power Music Ops
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Admin dashboard</p>
          </div>

          <div className="px-8 py-7">
            {signedOutNotice && (
              <div
                role="status"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="font-medium">Signed out successfully</p>
                  <p className="mt-0.5 text-emerald-800/90">
                    {signedOutNotice.name
                      ? `See you next time, ${signedOutNotice.name}.`
                      : 'You have been signed out.'}
                  </p>
                </div>
              </div>
            )}

            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Sign in</h2>
            <p className="mt-1 mb-6 text-sm text-[var(--color-text-secondary)]">
              Use your admin email and password to access the dashboard.
            </p>

            {errorMsg && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  placeholder="andrea@powermusic.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  Password
                </label>
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={inputClass}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/45">Authorized personnel only.</p>
      </main>
    </div>
  );
}
