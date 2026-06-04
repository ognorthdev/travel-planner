import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so we can return them after login.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
