import { useState, useEffect, useId, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  managerEmailDomainHint,
  isManagerAccountExistsMessage,
  validateManagerSignupFields,
  validateManagerEmail,
  MANAGER_ACCOUNT_EXISTS_MESSAGE,
  MANAGER_ACCOUNT_NOT_FOUND_MESSAGE,
  isManagerAccountNotFoundMessage,
  isPasswordStrongEnough,
} from '../utils/managerAuth';
import { formatCooldown, getOtpCooldownRemaining, setOtpCooldown } from '../utils/otpCooldown';
import { requestManagerPasswordReset, resendManagerSignupConfirmation } from '../utils/managerAuthEmail';
import ManagerAuthShell, {
  ManagerAuthLoading,
  inputClass,
  labelClass,
  buttonClass,
  errorClass,
} from '../components/auth/ManagerAuthShell';
import PasswordRequirements, { PasswordMatchHint } from '../components/auth/PasswordRequirements';
import PasswordInput from '../components/auth/PasswordInput';
import ManagerAuthEmailNotice from '../components/auth/ManagerAuthEmailNotice';

export default function Signup() {
  const {
    registerManager,
    checkManagerAccountExists,
    signInManager,
    user,
    role,
    loading: authLoading,
    logout,
    appConfig,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formId = useId();
  const signInEmailId = `${formId}-signin-email`;
  const signInPasswordId = `${formId}-signin-password`;
  const forgotEmailId = `${formId}-forgot-email`;

  const [mode, setMode] = useState(() => (location.state?.passwordUpdated ? 'signin' : 'signup'));
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    club: '',
    password: '',
    confirmPassword: '',
  });
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(() =>
    location.state?.passwordUpdated ? 'Your password was updated. Sign in with your new password.' : '',
  );
  const [verifySent, setVerifySent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [cooldownMs, setCooldownMs] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendNotice, setResendNotice] = useState('');
  const signInInFlightRef = useRef(false);
  const forgotInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);

  useEffect(() => {
    if (location.state?.passwordUpdated) {
      const email = typeof location.state.email === 'string' ? location.state.email : '';
      if (email) setSignInEmail(email);
      setMode('signin');
      setSuccessMsg('Your password was updated. Sign in with your new password.');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (cooldownMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      const email = resetEmail || forgotEmail || registeredEmail || formData.email;
      const remaining = getOtpCooldownRemaining(email);
      setCooldownMs(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownMs, resetEmail, forgotEmail, registeredEmail, formData.email]);

  const assertNotRateLimited = (email) => {
    const remaining = getOtpCooldownRemaining(email);
    if (remaining > 0) {
      setCooldownMs(remaining);
      setErrorMsg(`Please wait ${formatCooldown(remaining)} before requesting another email.`);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (authLoading) return;

    if (user && role && role !== 'manager') {
      logout().then(() => {
        setErrorMsg('This page is for manager accounts only.');
      });
    }
  }, [authLoading, user, role, logout]);

  if (authLoading) return <ManagerAuthLoading />;

  if (user && role === 'manager') return <Navigate to="/submit" replace />;
  if (user && role === 'admin') return <Navigate to="/" replace />;

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
    if (errorMsg) setErrorMsg('');
  };

  const switchMode = (next) => {
    setMode(next);
    setErrorMsg('');
    setSuccessMsg('');
    setVerifySent(false);
    setResetSent(false);
    setLoading(false);
    setResendError('');
    setResendNotice('');
    if (next === 'forgot' && signInEmail.trim()) {
      setForgotEmail(signInEmail.trim());
    }
  };

  const goToSignIn = (email = formData.email) => {
    setSignInEmail(email.trim());
    switchMode('signin');
  };

  const showVerifyScreen = (email, { resent = false } = {}) => {
    setOtpCooldown(email);
    setCooldownMs(getOtpCooldownRemaining(email));
    setRegisteredEmail(email);
    setVerifySent(true);
    setResendError('');
    setResendNotice(resent ? 'We sent another confirmation link.' : '');
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const validated = validateManagerSignupFields(formData, {
      enforceDomain: appConfig.enforceDomainCheck,
    });
    if (!validated.ok) {
      setErrorMsg(validated.error);
      return;
    }

    setLoading(true);

    try {
      const { exists } = await checkManagerAccountExists(validated.value.email, {
        enforceDomain: appConfig.enforceDomainCheck,
      });

      if (exists) {
        if (!assertNotRateLimited(validated.value.email)) return;

        try {
          const result = await resendManagerSignupConfirmation(validated.value.email, {
            enforceDomain: appConfig.enforceDomainCheck,
          });
          showVerifyScreen(result.email, { resent: true });
          return;
        } catch (resendErr) {
          setErrorMsg(resendErr.message || MANAGER_ACCOUNT_EXISTS_MESSAGE);
          return;
        }
      }

      const result = await registerManager(formData, {
        enforceDomain: appConfig.enforceDomainCheck,
      });

      if (result.needsConfirmation) {
        showVerifyScreen(result.email);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupEmail = async () => {
    if (!registeredEmail || resendInFlightRef.current) return;
    setResendError('');
    setResendNotice('');

    if (!assertNotRateLimited(registeredEmail)) {
      setResendError(`Please wait ${formatCooldown(getOtpCooldownRemaining(registeredEmail))} before requesting another email.`);
      return;
    }

    resendInFlightRef.current = true;
    setResendLoading(true);

    try {
      const result = await resendManagerSignupConfirmation(registeredEmail, {
        enforceDomain: appConfig.enforceDomainCheck,
      });
      setOtpCooldown(result.email);
      setCooldownMs(getOtpCooldownRemaining(result.email));
      setResendNotice('We sent another confirmation link.');
    } catch (err) {
      console.error(err);
      setResendError(err.message || 'Could not resend confirmation email.');
    } finally {
      resendInFlightRef.current = false;
      setResendLoading(false);
    }
  };

  const handleResendResetEmail = async () => {
    if (!resetEmail || resendInFlightRef.current) return;
    setResendError('');
    setResendNotice('');

    if (!assertNotRateLimited(resetEmail)) {
      setResendError(`Please wait ${formatCooldown(getOtpCooldownRemaining(resetEmail))} before requesting another email.`);
      return;
    }

    resendInFlightRef.current = true;
    setResendLoading(true);

    try {
      const result = await requestManagerPasswordReset(resetEmail, {
        enforceDomain: appConfig.enforceDomainCheck,
      });
      setOtpCooldown(result.email);
      setCooldownMs(getOtpCooldownRemaining(result.email));
      setResendNotice('We sent another reset link.');
    } catch (err) {
      console.error(err);
      setResendError(err.message || 'Could not resend reset email.');
    } finally {
      resendInFlightRef.current = false;
      setResendLoading(false);
    }
  };

  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!signInEmail.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (!signInPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    const emailResult = validateManagerEmail(signInEmail, {
      enforceDomain: appConfig.enforceDomainCheck,
    });
    if (!emailResult.ok) {
      setErrorMsg(emailResult.error);
      return;
    }

    if (signInInFlightRef.current) return;
    signInInFlightRef.current = true;

    try {
      await signInManager(signInEmail, signInPassword, {
        enforceDomain: appConfig.enforceDomainCheck,
      });
      navigate('/submit', { replace: true });
    } catch (err) {
      console.error(err);
      const msg = err.message || '';
      if (isManagerAccountNotFoundMessage(msg)) {
        setErrorMsg(MANAGER_ACCOUNT_NOT_FOUND_MESSAGE);
      } else if (
        msg.includes('Invalid login credentials') ||
        msg.includes('invalid_credentials') ||
        msg.includes('Incorrect email or password')
      ) {
        setErrorMsg('Wrong password. Please enter it again.');
      } else {
        setErrorMsg(msg || 'Sign in failed.');
      }
    } finally {
      signInInFlightRef.current = false;
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    const emailResult = validateManagerEmail(forgotEmail, {
      enforceDomain: appConfig.enforceDomainCheck,
    });
    if (!emailResult.ok) {
      setErrorMsg(emailResult.error);
      return;
    }

    if (!assertNotRateLimited(forgotEmail)) return;

    if (forgotInFlightRef.current) return;
    forgotInFlightRef.current = true;
    setLoading(true);

    try {
      const result = await requestManagerPasswordReset(forgotEmail, {
        enforceDomain: appConfig.enforceDomainCheck,
      });
      setOtpCooldown(forgotEmail);
      setCooldownMs(getOtpCooldownRemaining(forgotEmail));
      setResetEmail(result.email);
      setResetSent(true);
    } catch (err) {
      console.error(err);
      const msg = err.message || '';
      if (isManagerAccountNotFoundMessage(msg)) {
        setErrorMsg(MANAGER_ACCOUNT_NOT_FOUND_MESSAGE);
      } else {
        setErrorMsg(msg || 'Could not send reset email.');
      }
    } finally {
      forgotInFlightRef.current = false;
      setLoading(false);
    }
  };

  if (verifySent) {
    return (
      <ManagerAuthEmailNotice
        title="Check your email"
        onBack={() => switchMode('signin')}
        onResend={handleResendSignupEmail}
        resendLabel="Resend confirmation email"
        resendLoading={resendLoading}
        resendCooldownMs={cooldownMs}
        resendError={resendError}
        resendNotice={resendNotice}
      >
        We sent a confirmation link to{' '}
        <span className="font-medium text-[var(--color-text-primary)]">{registeredEmail}</span>.
        Click it once to finish setting up your account. Check spam if it does not arrive within a few minutes.
      </ManagerAuthEmailNotice>
    );
  }

  if (resetSent) {
    return (
      <ManagerAuthEmailNotice
        title="Check your email"
        onBack={() => {
          const email = resetEmail;
          setResetSent(false);
          setResetEmail('');
          setSignInEmail(email);
          switchMode('signin');
        }}
        onResend={handleResendResetEmail}
        resendLabel="Resend reset link"
        resendLoading={resendLoading}
        resendCooldownMs={cooldownMs}
        resendError={resendError}
        resendNotice={resendNotice}
      >
        We sent a password reset link to{' '}
        <span className="font-medium text-[var(--color-text-primary)]">{resetEmail}</span>.
        Open the link to choose a new password, then sign in. Check spam if it does not arrive within a few minutes.
      </ManagerAuthEmailNotice>
    );
  }

  if (mode === 'forgot') {
    const showCreateAccountHint = isManagerAccountNotFoundMessage(errorMsg);

    return (
      <ManagerAuthShell>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Reset password</h2>
        <p className="mt-1 mb-6 text-sm text-[var(--color-text-secondary)]">
          Enter your email and we will send you a link to choose a new password.
        </p>

        {errorMsg && (
          <div role="alert" className={errorClass}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>
              {errorMsg}
              {showCreateAccountHint && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-medium underline"
                  >
                    Create an account
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        <form onSubmit={handleForgotPasswordSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor={forgotEmailId} className={labelClass}>
              Email{appConfig.enforceDomainCheck ? ` (${managerEmailDomainHint()})` : ''}
            </label>
            <input
              id={forgotEmailId}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder="you@gmail.com"
              value={forgotEmail}
              onChange={(e) => {
                setForgotEmail(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              disabled={loading}
              className={inputClass}
              required
            />
          </div>

          <button type="submit" disabled={loading || cooldownMs > 0} className={buttonClass}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Sending link…</span>
              </>
            ) : cooldownMs > 0 ? (
              `Wait ${formatCooldown(cooldownMs)}`
            ) : (
              'Send reset link'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          Remember your password?{' '}
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="font-medium text-[var(--color-brand-accent)] hover:underline"
          >
            Back to sign in
          </button>
        </p>
      </ManagerAuthShell>
    );
  }

  if (mode === 'signin') {
    const showCreateAccountHint = isManagerAccountNotFoundMessage(errorMsg);

    return (
      <ManagerAuthShell>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Sign in</h2>
        <p className="mt-1 mb-6 text-sm text-[var(--color-text-secondary)]">
          Use the email and password you chose when you signed up.
        </p>

        {successMsg && (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className={errorClass}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>
              {errorMsg}
              {showCreateAccountHint && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-medium underline"
                  >
                    Create an account
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        <form onSubmit={handleSignInSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor={signInEmailId} className={labelClass}>
              Email{appConfig.enforceDomainCheck ? ` (${managerEmailDomainHint()})` : ''}
            </label>
            <input
              id={signInEmailId}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder="you@gmail.com"
              value={signInEmail}
              onChange={(e) => {
                setSignInEmail(e.target.value);
                if (errorMsg) setErrorMsg('');
                if (successMsg) setSuccessMsg('');
              }}
              className={inputClass}
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={signInPasswordId} className={labelClass}>
                Password
              </label>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs font-medium text-[var(--color-brand-accent)] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <PasswordInput
              id={signInPasswordId}
              name="password"
              autoComplete="current-password"
              value={signInPassword}
              onChange={(e) => {
                setSignInPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
                if (successMsg) setSuccessMsg('');
              }}
              required
            />
          </div>

          <button type="submit" className={buttonClass}>
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
          New here?{' '}
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className="font-medium text-[var(--color-brand-accent)] hover:underline"
          >
            Create an account
          </button>
        </p>
      </ManagerAuthShell>
    );
  }

  return (
    <ManagerAuthShell wide>
      <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Create account</h2>
      <p className="mt-1 mb-6 text-sm text-[var(--color-text-secondary)]">
        Fill in your details and choose a password. You may need to confirm your email once.
      </p>

      {errorMsg && (
        <div role="alert" className={errorClass}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="space-y-2">
            <p>{errorMsg}</p>
            {isManagerAccountExistsMessage(errorMsg) && (
              <button
                type="button"
                onClick={() => goToSignIn()}
                className="text-sm font-medium text-[var(--color-brand-accent)] hover:underline"
              >
                Sign in instead
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSignupSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-first" className={labelClass}>
              First name
            </label>
            <input
              id="signup-first"
              type="text"
              autoComplete="given-name"
              maxLength={100}
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              disabled={loading}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="signup-last" className={labelClass}>
              Last name
            </label>
            <input
              id="signup-last"
              type="text"
              autoComplete="family-name"
              maxLength={100}
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              disabled={loading}
              className={inputClass}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="signup-email" className={labelClass}>
            Email{appConfig.enforceDomainCheck ? ` (${managerEmailDomainHint()})` : ''}
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            maxLength={254}
            placeholder="you@gmail.com"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            disabled={loading}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="signup-club" className={labelClass}>
            Club location
          </label>
          <input
            id="signup-club"
            type="text"
            autoComplete="organization"
            maxLength={200}
            value={formData.club}
            onChange={(e) => handleChange('club', e.target.value)}
            disabled={loading}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="signup-password" className={labelClass}>
            Password
          </label>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            disabled={loading}
            required
            minLength={8}
          />
          <PasswordRequirements password={formData.password} email={formData.email} />
        </div>

        <div>
          <label htmlFor="signup-confirm" className={labelClass}>
            Confirm password
          </label>
          <PasswordInput
            id="signup-confirm"
            autoComplete="new-password"
            value={formData.confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            disabled={loading}
            required
            minLength={8}
          />
          <PasswordMatchHint password={formData.password} confirmPassword={formData.confirmPassword} />
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            !isPasswordStrongEnough(formData.password, { email: formData.email }) ||
            formData.password !== formData.confirmPassword
          }
          className={buttonClass}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Creating account…</span>
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => switchMode('signin')}
          className="font-medium text-[var(--color-brand-accent)] hover:underline"
        >
          Sign in
        </button>
      </p>
    </ManagerAuthShell>
  );
}
