import React, { useEffect, useState } from 'react';
import { Users, X, Trash2, Loader2 } from 'lucide-react';
import { membersApi } from '../api/index.js';

const ROLE_LABELS = {
  OWNER: 'Owner',
  EDITOR: 'Can edit',
  VIEWER: 'Can view',
};

export default function ShareModal({ tripId, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const isOwner = members.find((m) => m.isYou)?.role === 'OWNER';

  const load = async () => {
    try {
      const list = await membersApi.list(tripId);
      setMembers(list);
    } catch (err) {
      setError(err.message || 'Failed to load collaborators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setInviting(true);
    try {
      await membersApi.invite(tripId, email.trim(), role);
      setInfo(`${email.trim()} can now collaborate on this trip.`);
      setEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not add that person');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId) => {
    setError(null);
    setInfo(null);
    try {
      await membersApi.remove(tripId, userId);
      await load();
    } catch (err) {
      setError(err.message || 'Could not remove that person');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ocean-900/50 flex items-center justify-center">
              <Users size={20} className="text-ocean-400" />
            </div>
            <h3 className="font-bold text-slate-100 text-lg">Share trip</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {isOwner && (
          <form onSubmit={handleInvite} className="space-y-3 mb-5">
            <div className="flex gap-2">
              <input
                type="email"
                required
                placeholder="collaborator@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
              >
                <option value="EDITOR">Can edit</option>
                <option value="VIEWER">Can view</option>
              </select>
            </div>
            <button type="submit" disabled={inviting} className="btn-primary w-full justify-center">
              {inviting ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
              Invite
            </button>
            <p className="text-xs text-slate-500">They need a Travel Planner account with this email first.</p>
          </form>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</div>
        )}
        {info && (
          <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2 mb-3">{info}</div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-6 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {m.email || m.userId}
                    {m.isYou && <span className="text-slate-500"> (you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">{ROLE_LABELS[m.role] || m.role}</p>
                </div>
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    onClick={() => handleRemove(m.userId)}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove collaborator"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
