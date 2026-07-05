import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabase } from '../supabaseClient';
import { AlertCircle, Loader2 } from 'lucide-react';
import { validatePassword, isPasswordStrongEnough } from '../utils/managerAuth';
import ManagerAuthShell, { errorClass, labelClass, buttonClass } from '../components/auth/ManagerAuthShell';
import PasswordInput from '../components/auth/PasswordInput';
import PasswordRequirements, { PasswordMatchHint } from '../components/auth/PasswordRequirements';

const CALLBACK_TIMEOUT_MS = 45000;

function readAuthErrorFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return (
    hashParams.get('error_description') ||
    hashParams.get('error') ||
    queryParams.get('error_description') ||
    queryParams.get('error')
  );
}

function clearAuthParamsFromUrl() {
  window.history.replaceState(null, '', window.location.pathname);
}

function isRecoveryCallback() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { user, role, logout, initializing: authInitializing } = useAuth();
  const [errorMsg, setErrorMsg] = useState(() => readAuthErrorFromUrl());
  const [sessionPending, setSessionPending] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(() => isRecoveryCallback());
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const recoveryModeRef = useRef(isRecoveryCallback());
  const callbackTimeoutRef = useRef(null);

  const enterRecoveryMode = () => {
    recoveryModeRef.current = true;
    setRecoveryMode(true);
    setSessionPending(false);
    setErrorMsg('');
    if (callbackTimeoutRef.current) {
      window.clearTimeout(callbackTimeoutRef.current);
      callbackTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (readAuthErrorFromUrl()) {
      setSessionPending(false);
      return undefined;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Authentication is not configured.');
      setSessionPending(false);
      return undefined;
    }

    let active = true;

    async function completeCallback() {
      const queryParams = new URLSearchParams(window.location.search);
      const code = queryParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setErrorMsg(error.message || 'This sign-in link is invalid or has expired.');
          setSessionPending(false);
          return;
        }
      }

      if (isRecoveryCallback()) {
        enterRecoveryMode();
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        setSessionPending(false);
      }
    }

    completeCallback();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;

      if (event === 'PASSWORD_RECOVERY') {
        enterRecoveryMode();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        if (isRecoveryCallback()) {
          enterRecoveryMode();
          return;
        }
        setSessionPending(false);
      }
    });

    callbackTimeoutRef.current = window.setTimeout(() => {
      if (!active || recoveryModeRef.current) return;
      setSessionPending(false);
      setErrorMsg((prev) => prev || 'This sign-in link is invalid or has expired. Please request a new one.');
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      active = false;
      subscription.unsubscribe();
      if (callbackTimeoutRef.current) {
        window.clearTimeout(callbackTimeoutRef.current);
        callbackTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    const validated = validatePassword(newPassword, { email: user?.email });
    if (!validated.ok) {
      setErrorMsg(validated.error);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!isPasswordStrongEnough(newPassword, { email: user?.email })) {
      setErrorMsg('Please meet all password requirements below.');
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Authentication is not configured.');
      return;
    }

    setSavingPassword(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const email = user?.email || '';
      setRecoveryMode(false);
      recoveryModeRef.current = false;
      clearAuthParamsFromUrl();
      await logout();
      navigate('/submit/signup', {
        replace: true,
        state: { passwordUpdated: true, email },
      });
    } catch (err) {
      setErrorMsg(err.message || 'Could not save your new password.');
    } finally {
      setSavingPassword(false);
    }
  };

  useEffect(() => {
    if (recoveryMode || errorMsg || sessionPending || authInitializing) return;

    if (user && role === 'manager') {
      clearAuthParamsFromUrl();
      navigate('/submit', { replace: true });
      return;
    }

    if (user && role === 'admin') {
      clearAuthParamsFromUrl();
      navigate('/', { replace: true });
      return;
    }

    if (user && !role) return;

    if (!user) {
      setErrorMsg((prev) => prev || 'Could not sign you in. Please request a new link.');
    }
  }, [user, role, authInitializing, sessionPending, errorMsg, navigate, recoveryMode]);

  if (recoveryMode) {
    return (
      <ManagerAuthShell footnote="">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Choose a new password</h2>
        <p className="mt-1 mb-6 text-sm text-[var(--color-text-secondary)]">
          Pick a password you will use to sign in next time.
        </p>

        {errorMsg && (
          <div role="alert" className={errorClass}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSetNewPassword} className="space-y-4" noValidate>
          <div>
            <label htmlFor="recovery-password" className={labelClass}>
              New password
            </label>
            <PasswordInput
              id="recovery-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              disabled={savingPassword}
              required
              minLength={8}
            />
            <PasswordRequirements password={newPassword} email={user?.email} />
          </div>
          <div>
            <label htmlFor="recovery-confirm" className={labelClass}>
              Confirm password
            </label>
            <PasswordInput
              id="recovery-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              disabled={savingPassword}
              required
              minLength={8}
            />
            <PasswordMatchHint password={newPassword} confirmPassword={confirmPassword} />
          </div>
          <button
            type="submit"
            disabled={
              savingPassword ||
              !isPasswordStrongEnough(newPassword, { email: user?.email }) ||
              newPassword !== confirmPassword
            }
            className={buttonClass}
          >
            {savingPassword ? 'Saving…' : 'Save password and sign in'}
          </button>
        </form>
      </ManagerAuthShell>
    );
  }

  if (!errorMsg && (sessionPending || authInitializing || (user && !role))) {
    return (
      <ManagerAuthShell footnote="">
        <div className="text-center py-4">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--color-brand-primary)]" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">Signing you in…</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Confirming your email and opening the submission form.
          </p>
        </div>
      </ManagerAuthShell>
    );
  }

  if (errorMsg) {
    return (
      <ManagerAuthShell footnote="">
        <div role="alert" className={errorClass}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          <Link to="/submit/signup" className="font-medium text-[var(--color-brand-accent)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </ManagerAuthShell>
    );
  }

  if (user && role === 'manager') {
    return <Navigate to="/submit" replace />;
  }

  if (user && role === 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <ManagerAuthShell footnote="">
      <div className="text-center py-4">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--color-brand-primary)]" aria-hidden="true" />
        <h2 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">Finishing sign-in…</h2>
      </div>
    </ManagerAuthShell>
  );
}
