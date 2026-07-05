import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminEmail } from '../utils/adminAccess';
import { ManagerAuthLoading } from '../components/auth/ManagerAuthShell';

export function AdminRoute() {
  const { user, role } = useAuth();

  if (!user) {
    return <Navigate to="/admin/login" replace />;
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

  if (!authReady) {
    return <ManagerAuthLoading />;
  }

  if (!user) {
    return <Navigate to="/submit/signup" replace state={{ from: '/submit' }} />;
  }

  if (!session?.access_token) {
    return <ManagerAuthLoading />;
  }

  if (role === 'admin' || isAdminEmail(user.email)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

/** Login / signup — signed-in managers go to the form; admins go to the dashboard. */
export function ManagerGuestRoute() {
  const { user, role, authReady } = useAuth();

  if (!authReady) {
    return <ManagerAuthLoading />;
  }

  if (user && (role === 'admin' || isAdminEmail(user.email))) {
    return <Navigate to="/" replace />;
  }

  if (user && role === 'manager') {
    return <Navigate to="/submit" replace />;
  }

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
