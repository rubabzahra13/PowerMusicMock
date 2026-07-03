import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Zap, AlertCircle } from 'lucide-react';
import { Toast, useToast } from '../components/ui';

export default function AdminLogin() {
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
      await login(email, password, 'admin');
      showToast('Welcome back, Andrea!', 'success');
      navigate('/');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Invalid email or password.');
      showToast('Authentication failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-brand-primary)] flex flex-col items-center justify-center p-6 antialiased font-sans select-none relative">
      <Toast />
      
      {/* Background visual decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] rounded-full bg-[var(--color-brand-accent)] blur-[120px]"></div>
        <div className="absolute bottom-[20%] right-[20%] w-[350px] h-[350px] rounded-full bg-[var(--color-brand-accent)] blur-[150px]"></div>
      </div>

      <div className="w-full max-w-[400px] z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-brand-accent)] flex items-center justify-center shadow-lg mb-3">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-wide">Power Music Ops</h1>
          <p className="text-sm text-white/60 mt-1">Admin Dashboard Portal</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-white/5 shadow-2xl p-8 relative">
          <h2 className="text-lg font-bold text-[var(--color-brand-primary)] mb-6">Administrator Sign In</h2>

          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2.5 text-xs text-[var(--color-tag-removed-text)]">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Admin Email
              </label>
              <input
                type="email"
                placeholder="andrea@powermusic.com"
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
              className="w-full h-10 bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)] text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
