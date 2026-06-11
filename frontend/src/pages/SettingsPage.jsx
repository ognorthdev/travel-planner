import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Sparkles, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { meApi } from '../api/index.js';
import { useAuth } from '../lib/auth.jsx';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-700 bg-slate-800">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-10">
          {user?.email && (
            <p className="text-sm text-slate-400">
              Signed in as <span className="text-slate-200 font-medium">{user.email}</span>
            </p>
          )}
          <ResearchContextSection profile={profile} refreshProfile={refreshProfile} />
          <ChangePasswordSection />
        </div>
      </div>
    </div>
  );
}

function ResearchContextSection({ profile, refreshProfile }) {
  const [value, setValue] = useState(profile?.researchContext || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const dirty = value !== (profile?.researchContext || '');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await meApi.update({ researchContext: value });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-ocean-400" />
        <h3 className="text-base font-semibold text-slate-100">Research Context</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Preferences and context applied to <span className="text-slate-300">every</span> trip when researching
        ideas — travel style, dietary needs, budget, who you usually travel with, things to avoid. Individual trips
        can add their own context in Trip Settings.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. We're a family of four with two young kids. Vegetarian, no shellfish. Prefer walkable neighborhoods, local food over tourist spots, and a mid-range budget. Avoid very long hikes."
        rows={5}
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
      />
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Save
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-400 animate-fade-in">
            <Check size={14} />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

function ChangePasswordSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Could not update password.');
      } else {
        setSuccess(true);
        setPassword('');
        setConfirm('');
        setTimeout(() => setSuccess(false), 4000);
      }
    } catch (err) {
      setError(err.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="pt-2 border-t border-slate-800">
      <div className="flex items-center gap-2 mb-2 mt-6">
        <Lock size={16} className="text-ocean-400" />
        <h3 className="text-base font-semibold text-slate-100">Change Password</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Set a new password for your account. You'll stay signed in on this device.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1.5">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1.5">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Re-enter new password"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && (
          <p className="flex items-center gap-1 text-sm text-emerald-400 animate-fade-in">
            <Check size={14} />
            Password updated.
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !password || !confirm}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          Update Password
        </button>
      </form>
    </section>
  );
}
