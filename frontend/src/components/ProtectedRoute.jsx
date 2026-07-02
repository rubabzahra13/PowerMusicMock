import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminRoute() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-bg)] text-[var(--color-text-secondary)]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[var(--color-brand-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}

export function ProtectedRoute({ allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-bg)] text-[var(--color-text-secondary)]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[var(--color-brand-accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={role === 'admin' ? '/' : '/submit'} replace />;
  }

  return <Outlet />;
}
