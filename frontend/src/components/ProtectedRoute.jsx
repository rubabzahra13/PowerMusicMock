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

  // Known signed-in manager with a usable token → render the form.
  if (user && session?.access_token && role === 'manager') {
    return <Outlet />;
  }

  // Known admin → straight to the admin dashboard.
  if (user && (role === 'admin' || isAdminEmail(user.email))) {
    return <Navigate to="/" replace />;
  }

  // Boot / profile still resolving.
  if (!authReady || (user && !role)) {
    return <ManagerAuthLoading />;
  }

  // Manager identity is known but the access token is briefly missing (refresh /
  // storage race). Wait — do NOT bounce to signup, or GuestRoute sends them
  // straight back here and the UI flashes forever.
  if (user && role === 'manager') {
    return <ManagerAuthLoading />;
  }

  if (!user || !session?.access_token) {
    return <Navigate to="/submit/signup" replace state={{ from: '/submit' }} />;
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

  // Signed-in but role not resolved yet — wait so we don't flash the form.
  if (user && (!authReady || !role)) {
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
