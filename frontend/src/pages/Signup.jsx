import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Toast, useToast } from '../components/ui';

export default function Signup() {
  const { signup, appConfig } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    club: ''
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const { firstName, lastName, email, password, club } = formData;

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !club.trim()) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (appConfig.enforceDomainCheck && !email.toLowerCase().endsWith('@puregym.com')) {
      setErrorMsg('Email address must end with @puregym.com.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await signup(email, password, {
        firstName,
        lastName,
        club
      });
      
      showToast('Registration successful! Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Registration failed.');
      showToast('Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-bg)] flex flex-col items-center justify-center p-6 antialiased font-sans select-none relative">
      <Toast />
      
      <div className="w-full max-w-[450px] z-10">
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
          <h2 className="text-lg font-bold text-[var(--color-brand-primary)] mb-6">Create Manager Account</h2>

          {errorMsg && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2.5 text-xs text-[var(--color-tag-removed-text)]">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  disabled={loading}
                  className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  disabled={loading}
                  className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Email Address (@puregym.com)
              </label>
              <input
                type="email"
                placeholder="john.doe@puregym.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                disabled={loading}
                className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Club / Location
              </label>
              <input
                type="text"
                placeholder="Leeds Central"
                value={formData.club}
                onChange={(e) => handleChange('club', e.target.value)}
                disabled={loading}
                className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Password (min 6 characters)
              </label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                disabled={loading}
                className="w-full h-10 px-3 bg-[var(--color-surface-bg)] text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-accent)] transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 mt-2 bg-[var(--color-brand-primary)] hover:bg-opacity-95 text-white text-sm font-semibold rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[var(--color-text-secondary)]">
            Already have a manager account?{' '}
            <Link to="/login" className="text-[var(--color-brand-accent)] font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
