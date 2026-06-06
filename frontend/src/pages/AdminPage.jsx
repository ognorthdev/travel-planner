import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { adminApi } from '../api/index.js';

export default function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      setUsers(await adminApi.listUsers());
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (userId, fn) => {
    setBusyId(userId);
    setError(null);
    try {
      await fn(userId);
      await load();
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const pending = users.filter((u) => u.status !== 'approved');
  const approved = users.filter((u) => u.status === 'approved');

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-slate-700 text-slate-400">
            <ArrowLeft size={20} />
          </button>
          <ShieldCheck size={20} className="text-ocean-400" />
          <h1 className="font-bold text-slate-100 text-lg">User administration</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-10 text-slate-500"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <section>
              <h2 className="text-slate-300 font-semibold mb-3">
                Pending approval {pending.length > 0 && <span className="text-amber-400">({pending.length})</span>}
              </h2>
              {pending.length === 0 ? (
                <p className="text-slate-500 text-sm">No one is waiting.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((u) => (
                    <UserRow key={u.userId} u={u} busy={busyId === u.userId}>
                      <button
                        onClick={() => act(u.userId, adminApi.approve)}
                        disabled={busyId === u.userId}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-60"
                      >
                        <Check size={15} /> Approve
                      </button>
                    </UserRow>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-slate-300 font-semibold mb-3">Approved ({approved.length})</h2>
              <div className="space-y-2">
                {approved.map((u) => (
                  <UserRow key={u.userId} u={u} busy={busyId === u.userId}>
                    {u.isAdmin ? (
                      <span className="text-xs text-ocean-400 font-medium px-2">admin</span>
                    ) : (
                      <button
                        onClick={() => act(u.userId, adminApi.revoke)}
                        disabled={busyId === u.userId}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 text-sm font-medium disabled:opacity-60"
                      >
                        <X size={15} /> Revoke
                      </button>
                    )}
                  </UserRow>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function UserRow({ u, busy, children }) {
  return (
    <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-slate-200 truncate">{u.email}</p>
        <p className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center">{busy ? <Loader2 size={16} className="animate-spin text-slate-500 mr-2" /> : null}{children}</div>
    </div>
  );
}
