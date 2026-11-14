/**
 * Sign-in for the admin site. Staff accounts only: a customer account that
 * signs in here is told it has no access and its new session is ended at once.
 */
import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { env } from '../config/env';
import { adminSession, AdminUser } from './adminSession';
import { isStaff } from './opsService';

export const AdminLogin: React.FC<{ onSignedIn: (user: AdminUser) => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`${env.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) throw new Error(data?.error?.message || 'Sign-in failed.');
      if (!isStaff(data.user?.role)) {
        // Not staff: end the session that was just opened, and say nothing more.
        await fetch(`${env.API_BASE_URL}/auth/logout`, {
          method: 'POST', headers: { Authorization: `Bearer ${data.token}` },
        }).catch(() => undefined);
        throw new Error('This account has no access here.');
      }
      const user: AdminUser = { id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role };
      adminSession.set(data.token, user);
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof TypeError ? 'The server could not be reached.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-10 w-full rounded-md border border-border bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-blue-600';
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-white p-6 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2 text-brand-heading">
          <Lock size={18} />
          <h1 className="text-[18px] font-bold">Operations console</h1>
        </div>
        <p className="text-[12.5px] text-brand-muted -mt-1">Staff sign-in. Access is recorded.</p>
        <label className="text-[12px] font-semibold text-brand-body">Email
          <input type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="text-[12px] font-semibold text-brand-body">Password
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={`${field} mt-1`} />
        </label>
        {error && <p className="text-[12.5px] text-red-700">{error}</p>}
        <button type="submit" disabled={busy}
          className="h-10 rounded-md bg-slate-900 text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 size={15} className="animate-spin" />} Sign in
        </button>
      </form>
    </div>
  );
};
