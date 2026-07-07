import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminEmail } from '../utils/adminAccess';
import { ManagerAuthLoading } from '../components/auth/ManagerAuthShell';

export function AdminRoute() {
  const { user, role, authReady } = useAuth();

  // Never show the dashboard shell before the session has been verified.
  if (!user) {
    return authReady ? <Navigate to="/admin/login" replace /> : <ManagerAuthLoading />;
  }

  if (!role) {
    return <ManagerAuthLoading />;
  }

  if (role === 'admin') {
    return <Outlet />;
  }

  if (role === 'manager') {
    return <Navigate to="/submit" replace />;
  }

  return <Navigate to="/admin/login" replace />;
}

/** Manager-only pages — admins and guests cannot access the submit form. */
export function ManagerRoute() {
  const { user, role, session, authReady } = useAuth();

  // Already-known signed-in manager (remembered login, read from cache
  // synchronously) → render instantly, no blank wait while the background
  // session check runs. If that check later fails, the 401 handler signs out.
  if (user && session?.access_token && role === 'manager') {
    return <Outlet />;
  }

  // Known admin → straight to the admin dashboard.
  if (user && (role === 'admin' || isAdminEmail(user.email))) {
    return <Navigate to="/" replace />;
  }

  // Nothing known yet — wait for the auth check rather than flashing content.
  if (!authReady) {
    return <ManagerAuthLoading />;
  }

  if (!user || !session?.access_token) {
    return <Navigate to="/submit/signup" replace state={{ from: '/submit' }} />;
  }

  // Signed in but role not resolved yet.
  if (!role) {
    return <ManagerAuthLoading />;
  }

  return <Outlet />;
}

/** Login / signup — signed-in managers go to the form; admins go to the dashboard. */
export function ManagerGuestRoute() {
  const { user, role, authReady } = useAuth();

  // Known signed-in user → redirect immediately, no blank.
  if (user && (role === 'admin' || isAdminEmail(user.email))) {
    return <Navigate to="/" replace />;
  }
  if (user && role === 'manager') {
    return <Navigate to="/submit" replace />;
  }

  // A cached user with no known role yet — wait briefly so we don't flash the
  // login form before redirecting them in.
  if (user && !authReady) {
    return <ManagerAuthLoading />;
  }

  // No signed-in user → show the login / signup form right away (it's public).
  return <Outlet />;
}

export function ProtectedRoute({ allowedRoles }) {
  const { user, role } = useAuth();

  if (!user) {
    return <Navigate to="/submit/signup" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={role === 'admin' ? '/' : '/submit/signup'} replace />;
  }

  return <Outlet />;
}
