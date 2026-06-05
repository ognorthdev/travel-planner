import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PendingApproval from './PendingApproval';

function FullScreen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-400">
      {children}
    </div>
  );
}

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, profile, profileLoading } = useAuth();
  const location = useLocation();

  // Still resolving the Supabase session.
  if (loading) return <FullScreen>Loading…</FullScreen>;

  // Not signed in → login.
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Signed in, but the account record hasn't loaded yet.
  if (!profile) return <FullScreen>{profileLoading ? 'Loading…' : 'Could not load your account. Please retry.'}</FullScreen>;

  // Signed in but not approved.
  if (profile.status !== 'approved') return <PendingApproval />;

  // Admin-only route guard.
  if (adminOnly && !profile.isAdmin) return <Navigate to="/" replace />;

  return children;
}
