import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function PendingApproval() {
  const { profile, signOut, refreshProfile, profileLoading } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl text-center">
        <div className="w-12 h-12 rounded-full bg-amber-900/40 flex items-center justify-center mx-auto mb-4">
          <Clock size={22} className="text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Awaiting approval</h1>
        <p className="text-slate-400 text-sm mb-6">
          Your account{profile?.email ? ` (${profile.email})` : ''} has been created and is waiting
          for the admin to approve access. You'll be able to plan trips once approved.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => refreshProfile()}
            disabled={profileLoading}
            className="btn-primary w-full justify-center"
          >
            <RefreshCw size={16} className={profileLoading ? 'animate-spin' : ''} />
            Check again
          </button>
          <button
            onClick={() => signOut()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
