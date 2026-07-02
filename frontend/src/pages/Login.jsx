import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, AlertCircle } from 'lucide-react';
import { Toast, useToast } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      await login(email, password, 'manager');
      showToast('Logged in successfully.', 'success');
      navigate('/submit');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Invalid email or password.');
      showToast('Authentication failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-bg)] flex flex-col items-center justify-center p-6 antialiased font-sans select-none relative">
      <Toast />
      
      <div className="w-full max-w-[400px] z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-brand-primary)] flex items-center justify-center shadow-lg mb-3">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-brand-primary)] tracking-wide">Power Music</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manager Submission Portal</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-[var(--color-border-default)] shadow-xl p-8">
          <h2 className="text-lg font-bold text-[var(--color-brand-primary)] mb-6">Manager Sign In</h2>

          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2.5 text-xs text-[var(--color-tag-removed-text)]">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                placeholder="manager@puregym.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] focus:ring-1 focus:ring-[var(--color-brand-accent)] transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-[var(--color-brand-primary)] hover:bg-opacity-95 text-white text-sm font-semibold rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[var(--color-text-secondary)]">
            Don't have a manager account?{' '}
            <Link to="/signup" className="text-[var(--color-brand-accent)] font-semibold hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
