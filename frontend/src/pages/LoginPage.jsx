import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/';

  // Already signed in → bounce to where they were headed.
  if (!loading && user) return <Navigate to={from} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(from, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          // Email confirmation disabled → signed in immediately.
          navigate(from, { replace: true });
        } else {
          // Email confirmation enabled → tell them to check their inbox.
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden bg-slate-950">
      {/* Full-bleed destination backdrop */}
      <img
        src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=2000&q=70"
        alt=""
        className="absolute inset-0 w-full h-full object-cover animate-ken-burns"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/70 to-slate-950/90" />

      <div className="relative w-full max-w-sm glass rounded-2xl p-8 shadow-2xl shadow-black/50">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-300/80 mb-1">Your travel atlas</p>
        <h1 className="font-display font-semibold text-3xl text-white mb-1">Travel Planner</h1>
        <p className="text-slate-300/80 text-sm mb-6">
          {mode === 'signin' ? 'Sign in to your trips' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-950/60 border border-white/15 text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400/70"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-950/60 border border-white/15 text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400/70"
            />
            {mode === 'signup' && (
              <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white font-medium py-2 transition-colors"
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setInfo(null);
          }}
          className="w-full text-sm text-slate-400 hover:text-slate-200 mt-4 transition-colors"
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
