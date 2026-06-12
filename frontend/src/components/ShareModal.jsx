import React, { useEffect, useState } from 'react';
import { Users, X, Trash2, Loader2, Link2, Copy, Check, RefreshCw } from 'lucide-react';
import { membersApi, tripsApi } from '../api/index.js';

const ROLE_LABELS = {
  OWNER: 'Owner',
  EDITOR: 'Can edit',
  VIEWER: 'Can view',
};

export default function ShareModal({ tripId, trip, onTripUpdated, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareToken = trip?.shareToken;
  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : null;

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
      const result = await membersApi.invite(tripId, email.trim(), role);
      setInfo(result.emailSent
        ? `Invitation email sent to ${email.trim()}.`
        : `${email.trim()} can now collaborate on this trip — let them know to sign in with this email.`);
      setEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not add that person');
    } finally {
      setInviting(false);
    }
  };

  const handleEnableShare = async () => {
    setShareBusy(true);
    setError(null);
    try {
      const { shareToken: token } = await tripsApi.enableShare(tripId);
      onTripUpdated?.({ shareToken: token });
    } catch (err) {
      setError(err.message || 'Could not create the link');
    } finally {
      setShareBusy(false);
    }
  };

  const handleDisableShare = async () => {
    setShareBusy(true);
    setError(null);
    try {
      await tripsApi.disableShare(tripId);
      onTripUpdated?.({ shareToken: null });
    } catch (err) {
      setError(err.message || 'Could not disable the link');
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link text manually');
    }
  };

  const handleRemove = async (memberId) => {
    setError(null);
    setInfo(null);
    try {
      await membersApi.remove(tripId, memberId);
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
            <p className="text-xs text-slate-500">If they don't have an account yet, the invite is claimed automatically when they sign up with this email.</p>
          </form>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</div>
        )}
        {info && (
          <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2 mb-3">{info}</div>
        )}

        {isOwner && (
          <div className="mb-5 border border-slate-700 rounded-xl p-3 bg-slate-900/40">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Link2 size={15} className="text-teal-400" />
                <p className="text-sm font-semibold text-slate-200">Public link</p>
              </div>
              {shareToken ? (
                <button
                  onClick={handleDisableShare}
                  disabled={shareBusy}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Disable
                </button>
              ) : (
                <button
                  onClick={handleEnableShare}
                  disabled={shareBusy}
                  className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium"
                >
                  {shareBusy ? 'Creating…' : 'Create link'}
                </button>
              )}
            </div>
            {shareToken ? (
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 px-2.5 py-1.5 text-xs focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={handleEnableShare}
                  disabled={shareBusy}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  title="Rotate link (old link stops working)"
                >
                  <RefreshCw size={14} className={shareBusy ? 'animate-spin' : ''} />
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Anyone with the link can view the itinerary — no account needed. Read-only.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-6 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {m.email}
                    {m.isYou && <span className="text-slate-500"> (you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABELS[m.role] || m.role}
                    {!m.joined && m.role !== 'OWNER' && <span className="text-amber-500"> · invited, not signed up yet</span>}
                  </p>
                </div>
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    onClick={() => handleRemove(m.id)}
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
