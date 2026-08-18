import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Partner-branded entry: /:partner/submit → signup (guest) or live form (signed-in manager).
 */
export default function PartnerSubmitEntry() {
  const { partner } = useParams();
  const { user, role, loading } = useAuth();
  const slug = partner || '';

  if (loading) return null;

  if (user && role === 'manager') {
    return <Navigate to="/submit" replace />;
  }

  return <Navigate to={`/${slug}/submit/signup`} replace />;
}
