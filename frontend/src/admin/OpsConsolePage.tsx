/**
 * Operations console — for the internal developer and cyber team only.
 *
 * Opened at ?page=ops by a signed-in ADMIN, SECURITY or OPERATOR account. It
 * is in no menu, and every figure and action comes from /api/v1/ops, where the
 * server checks the role again: hiding the page is a convenience, the server
 * is the protection.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, Download, KeyRound, Link2, Loader2, LogOut,
  RefreshCw, Search, Shield, ShieldAlert, ShieldCheck, Trash2, UserCog, Users, X,
} from 'lucide-react';
import {
  ALL_ROLES, AdminAction, Alert, Capabilities, OpsError, OpsUser, Overview, SecurityEvent, StaffRole,
  UsageData, opsService,
} from './opsService';
import { useToast } from './toast';

type Tab = 'overview' | 'users' | 'usage' | 'security' | 'alerts' | 'actions';

const METRIC_LABEL: Record<string, string> = {
  sign_in: 'Sign-ins', calculation: 'Calculations', method_calculation: 'Method calculations',
  report_export: 'Report exports', ai_estimate: 'AI estimates', rows_saved: 'Rows saved',
  audit_entry: 'Audit entries',
};

const SEVERITY_CLASS: Record<string, string> = {
  info: 'bg-slate-100 text-slate-700',
  warning: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

const ALERT_LABEL: Record<string, string> = {
  failed_sign_ins_account: 'Repeated failed sign-ins on one account',
  failed_sign_ins_network: 'Repeated failed sign-ins from one network',
  refused_requests_burst: 'Burst of refused requests from one network',
  staff_sign_in_new_network: 'Staff account signed in from a new network',
  staff_role_granted: 'Staff role granted',
};

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}) : '—');

const panel = 'rounded-xl border border-border bg-surface-raised p-4 sm:p-5';
const input = 'h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-brand-body focus-visible:outline-2 focus-visible:outline-blue-600';
const btn = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border transition-colors disabled:opacity-50';

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    load().then((value) => { setData(value); setError(undefined); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run };
}

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'warn' | 'bad' }> = ({ label, value, hint, tone }) => (
  <div className={panel}>
    <div className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">{label}</div>
    <div className={`text-[26px] font-bold tabular-nums mt-1 ${tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-brand-heading'}`}>{value}</div>
    {hint && <div className="text-[11.5px] text-brand-muted mt-0.5">{hint}</div>}
  </div>
);

const Problem: React.FC<{ message?: string }> = ({ message }) => (message ? (
  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{message}</div>
) : null);

const Spinner = () => (
  <div className="flex items-center gap-2 py-6 text-[13px] text-brand-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
);

/** Every day from `from` to `to`, so a quiet day shows as an empty bar, not a gap. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** A simple bar chart: one bar per day. */
const Bars: React.FC<{ points: Array<{ label: string; value: number; secondary?: number }>; colour?: string }> = ({ points, colour = 'bg-blue-500' }) => {
  const max = Math.max(1, ...points.map((p) => p.value + (p.secondary ?? 0)));
  if (points.length === 0 || points.every((p) => p.value + (p.secondary ?? 0) === 0)) return <p className="text-[13px] text-brand-muted py-6">No activity in this period.</p>;
  return (
    <div className="flex items-end gap-[3px] h-36 overflow-x-auto" role="img" aria-label="Daily activity chart">
      {points.map((p) => (
        <div key={p.label} className="flex flex-col justify-end h-full min-w-[8px] flex-1" title={`${p.label}: ${p.value}${p.secondary ? ` (+${p.secondary} failed)` : ''}`}>
          {p.secondary ? <div className="bg-red-400 rounded-t-sm" style={{ height: `${(p.secondary / max) * 100}%` }} /> : null}
          <div className={`${colour} ${p.secondary ? '' : 'rounded-t-sm'}`} style={{ height: `${(p.value / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
};

// ── Tabs ───────────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ can: Capabilities }> = ({ can }) => {
  const { data, error, loading, reload } = useLoad<Overview>(() => opsService.overview(), []);
  const usage = useLoad<UsageData>(() => opsService.usage(), []);
  if (loading) return <Spinner />;
  if (error || !data) return <Problem message={error} />;
  const byDay = new Map((usage.data?.signIns ?? []).map((d) => [d.day, d]));
  const signIns = usage.data
    ? daysBetween(usage.data.from, usage.data.to).map((label) => ({
      label, value: Number(byDay.get(label)?.ok ?? 0), secondary: Number(byDay.get(label)?.failed ?? 0),
    }))
    : [];
  const hours = Math.floor(data.server.uptimeSeconds / 3600);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" onClick={reload} className={`${btn} border-border text-brand-body`}><RefreshCw size={13} /> Refresh</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Accounts" value={data.users.total} hint={`${data.users.new7d} new this week · ${data.users.staff} staff`} />
        <Stat label="Active today" value={data.users.activeToday} hint={`${data.users.active7d} in the last 7 days`} />
        <Stat label="Sign-ins (24 h)" value={data.signIns24h.ok}
          hint={`${data.signIns24h.failed} failed · ${data.signIns24h.locked} locked`}
          tone={data.signIns24h.failed > data.signIns24h.ok && data.signIns24h.failed > 5 ? 'warn' : undefined} />
        <Stat label={can.viewSecurity ? 'Open alerts' : 'Refused requests (24 h)'}
          value={can.viewSecurity ? data.openAlerts : data.refused24h}
          tone={can.viewSecurity && data.openAlerts > 0 ? 'bad' : undefined}
          hint={can.viewSecurity ? `${data.refused24h} refused requests in 24 h` : undefined} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`${panel} lg:col-span-2`}>
          <h3 className="text-[13px] font-bold text-brand-heading mb-3">Sign-ins, last 30 days <span className="font-normal text-brand-muted">(red: failed)</span></h3>
          <Bars points={signIns} />
        </div>
        <div className={panel}>
          <h3 className="text-[13px] font-bold text-brand-heading mb-3">Usage, last 30 days</h3>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {Object.keys(data.usage30d).length === 0 && <li className="text-brand-muted">Nothing recorded yet.</li>}
            {Object.entries(data.usage30d).sort((a, b) => b[1] - a[1]).map(([metric, total]) => (
              <li key={metric} className="flex justify-between"><span>{METRIC_LABEL[metric] ?? metric}</span><span className="font-mono tabular-nums">{total.toLocaleString('en-IN')}</span></li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-border text-[11.5px] text-brand-muted leading-relaxed">
            Server up {hours} h · Node {data.server.node} · {data.server.environment}<br />
            {data.activeSessions} active sessions · {data.users.suspended} suspended accounts<br />
            Logs kept {data.server.retentionDays} days, IP addresses masked.
          </div>
        </div>
      </div>
    </div>
  );
};

const UserDrawer: React.FC<{ id: string; can: Capabilities; onClose: () => void; onChanged: () => void }> = ({ id, can, onClose, onChanged }) => {
  const { data, error, loading, reload } = useLoad(() => opsService.user(id), [id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [role, setRole] = useState('');
  const [confirm, setConfirm] = useState('');
  const [temporary, setTemporary] = useState<string | null>(null);
  const addToast = useToast();

  useEffect(() => { if (data) setRole(data.user.role); }, [data]);

  const act = async (label: string, work: () => Promise<unknown>, closes = false) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
      addToast('success', label);
      onChanged();
      if (closes) {
        onClose();
        return;
      }
      reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-xl h-full overflow-y-auto bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Account details">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[18px] font-bold text-brand-heading">{data?.user.name ?? 'Account'}</h2>
            <p className="text-[12.5px] text-brand-muted">{data?.user.email}{data?.user.phone ? ` · ${data.user.phone}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-brand-muted hover:text-brand-heading"><X size={18} /></button>
        </div>
        {loading && <Spinner />}
        <Problem message={error || message} />
        {data && (
          <div className="flex flex-col gap-4 text-[13px]">
            <div className={`${panel} grid grid-cols-2 gap-x-4 gap-y-1.5`}>
              <span className="text-brand-muted">Organisation</span><span>{data.user.companyName}</span>
              <span className="text-brand-muted">Role</span><span className="font-semibold">{data.user.role}</span>
              <span className="text-brand-muted">Status</span>
              <span className={data.user.status === 'suspended' ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                {data.user.status}{data.user.suspendedReason ? ` — ${data.user.suspendedReason}` : ''}
              </span>
              <span className="text-brand-muted">Signs in with</span><span>{data.user.authProvider ?? 'email'}</span>
              <span className="text-brand-muted">Created</span><span>{fmt(data.user.createdAt)}</span>
              <span className="text-brand-muted">Last sign-in</span><span>{fmt(data.user.lastLoginAt)}</span>
              <span className="text-brand-muted">Active sessions</span><span>{data.sessions.length}</span>
            </div>

            {can.actOnUsers && (
              <div className={`${panel} flex flex-col gap-3`}>
                <h3 className="text-[13px] font-bold text-brand-heading">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {data.user.status === 'active' ? (
                    <button type="button" disabled={busy} className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}
                      onClick={() => {
                        const reason = window.prompt('Reason for suspending this account (kept in the log):');
                        if (reason && reason.trim().length >= 3) void act('Account suspended.', () => opsService.suspend(id, reason.trim()));
                      }}>
                      <ShieldAlert size={13} /> Suspend
                    </button>
                  ) : (
                    <button type="button" disabled={busy} className={`${btn} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}
                      onClick={() => void act('Account reactivated.', () => opsService.reactivate(id))}>
                      <ShieldCheck size={13} /> Reactivate
                    </button>
                  )}
                  <button type="button" disabled={busy} className={`${btn} border-border text-brand-body hover:bg-slate-50`}
                    onClick={() => window.confirm('End every session for this account?') && void act('Signed out everywhere.', () => opsService.signOut(id))}>
                    <LogOut size={13} /> Sign out everywhere
                  </button>
                  <button type="button" disabled={busy} className={`${btn} border-border text-brand-body hover:bg-slate-50`}
                    onClick={() => window.confirm('Invalidate the current password and end every session? You will be shown a one-time temporary password to give the account holder.')
                      && void act('Password reset forced.', async () => {
                        const result = await opsService.forceReset(id);
                        setTemporary(result.temporaryPassword);
                        if (!result.temporaryPassword) setMessage(result.message);
                      })}>
                    <KeyRound size={13} /> Force password reset
                  </button>
                </div>
                {temporary && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px] text-amber-900">
                    <div className="font-semibold mb-1">One-time temporary password — shown once</div>
                    <div className="font-mono text-[14px] select-all break-all bg-white rounded px-2 py-1 border border-amber-200">{temporary}</div>
                    <p className="mt-1.5">Give it to the account holder through a trusted channel (not email). They should
                      change it in Settings straight after signing in. It is not stored or logged anywhere.</p>
                    <button type="button" className="mt-1.5 underline" onClick={() => setTemporary(null)}>I have handed it over — hide it</button>
                  </div>
                )}
                {can.changeRoles && (
                  <div className="flex flex-wrap items-center gap-2">
                    <UserCog size={14} className="text-brand-muted" />
                    <select value={role} onChange={(e) => setRole(e.target.value)} className={input} aria-label="Role">
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button type="button" disabled={busy || role === data.user.role}
                      className={`${btn} border-blue-200 text-blue-700 hover:bg-blue-50`}
                      onClick={() => window.confirm(`Change role from ${data.user.role} to ${role}? This signs them out.`)
                        && void act('Role changed.', () => opsService.setRole(id, role))}>
                      Change role
                    </button>
                  </div>
                )}
                {can.deleteUsers && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                    <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${input} flex-1`}
                      placeholder={`Type ${data.user.email} to delete`} aria-label="Confirm email to delete" />
                    <button type="button" disabled={busy || confirm.trim().toLowerCase() !== data.user.email.toLowerCase()}
                      className={`${btn} border-red-300 bg-red-600 text-white hover:bg-red-700`}
                      onClick={() => void act('Account deleted.', () => opsService.remove(id, confirm), true)}>
                      <Trash2 size={13} /> Delete account
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={panel}>
              <h3 className="text-[13px] font-bold text-brand-heading mb-2">Usage, last 30 days</h3>
              {data.usage.length === 0 ? <p className="text-brand-muted">Nothing recorded.</p> : (
                <ul className="flex flex-col gap-1">
                  {Object.entries(data.usage.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.metric]: (acc[u.metric] ?? 0) + u.count }), {}))
                    .map(([metric, total]) => (
                      <li key={metric} className="flex justify-between"><span>{METRIC_LABEL[metric] ?? metric}</span><span className="font-mono">{total}</span></li>
                    ))}
                </ul>
              )}
            </div>

            {data.events.length > 0 && (
              <div className={panel}>
                <h3 className="text-[13px] font-bold text-brand-heading mb-2">Recent security events</h3>
                <ul className="flex flex-col gap-1.5">
                  {data.events.slice(0, 20).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={`px-1.5 rounded ${SEVERITY_CLASS[e.severity]}`}>{e.severity}</span>
                      <span className="font-mono">{e.type}</span>
                      <span className="text-brand-muted">{fmt(e.at)} · {e.ip ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const UsersTab: React.FC<{ can: Capabilities }> = ({ can }) => {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string>();
  const { data, error, loading, reload } = useLoad(() => opsService.users({ q: query, role, status, page }), [query, role, status, page]);

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <label className="relative flex-1 min-w-[220px]">
          <span className="sr-only">Search accounts</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className={`${input} w-full pl-8`} placeholder="Name, email, phone or organisation" />
        </label>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className={input} aria-label="Role filter">
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={input} aria-label="Status filter">
          <option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <button type="submit" className={`${btn} border-blue-200 text-blue-700`}><Search size={13} /> Search</button>
      </form>
      <Problem message={error} />
      {loading ? <Spinner /> : data && (
        <div className={`${panel} p-0 sm:p-0 overflow-x-auto`}>
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-brand-muted border-b border-border">
              <tr>
                <th className="px-3 py-2">Account</th><th className="px-3 py-2">Organisation</th><th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last sign-in</th><th className="px-3 py-2 text-right">Use (30 d)</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} onClick={() => setOpen(u.id)} className="border-b border-border/60 last:border-0 cursor-pointer hover:bg-blue-50/50">
                  <td className="px-3 py-2"><div className="font-semibold text-brand-heading">{u.name}</div><div className="text-brand-muted">{u.email}</div></td>
                  <td className="px-3 py-2">{u.companyName}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">{u.role}</td>
                  <td className="px-3 py-2">{u.status === 'suspended' ? <span className="text-red-600 font-semibold">Suspended</span> : 'Active'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(u.lastLoginAt)}</td>
                  <td className="px-3 py-2 text-right font-mono">{u.usage30d ?? 0}</td>
                </tr>
              ))}
              {data.users.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-brand-muted">No account matches.</td></tr>}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 text-[12px] text-brand-muted border-t border-border">
            <span>{data.total} accounts</span>
            <span className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn} border-border`}>Previous</button>
              <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className={`${btn} border-border`}>Next</button>
            </span>
          </div>
        </div>
      )}
      {open && <UserDrawer id={open} can={can} onClose={() => setOpen(undefined)} onChanged={reload} />}
    </div>
  );
};

const UsageTab: React.FC = () => {
  const { data, error, loading } = useLoad<UsageData>(() => opsService.usage(), []);
  const byMetric = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    (data?.series ?? []).forEach((row) => {
      const days = out.get(row.metric) ?? new Map<string, number>();
      days.set(row.day, Number(row.total));
      out.set(row.metric, days);
    });
    return out;
  }, [data]);
  if (loading) return <Spinner />;
  if (error || !data) return <Problem message={error} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-brand-muted">{data.from} to {data.to}. Counts only — never what anyone calculated.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[...byMetric.entries()].map(([metric, days]) => (
          <div key={metric} className={panel}>
            <h3 className="text-[13px] font-bold text-brand-heading mb-3">
              {METRIC_LABEL[metric] ?? metric}
              <span className="font-normal text-brand-muted"> · {[...days.values()].reduce((a, b) => a + b, 0).toLocaleString('en-IN')} total</span>
            </h3>
            <Bars points={daysBetween(data.from, data.to).map((label) => ({ label, value: days.get(label) ?? 0 }))} colour="bg-teal-500" />
          </div>
        ))}
        {byMetric.size === 0 && <div className={panel}><p className="text-[13px] text-brand-muted">No usage recorded in this period.</p></div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={panel}>
          <h3 className="text-[13px] font-bold text-brand-heading mb-2">Most active accounts</h3>
          <ol className="flex flex-col gap-1 text-[13px]">
            {data.topUsers.map((u) => (
              <li key={u.id} className="flex justify-between gap-3"><span className="truncate">{u.name} <span className="text-brand-muted">· {u.companyName}</span></span><span className="font-mono">{Number(u.total)}</span></li>
            ))}
            {data.topUsers.length === 0 && <li className="text-brand-muted">None yet.</li>}
          </ol>
        </div>
        <div className={panel}>
          <h3 className="text-[13px] font-bold text-brand-heading mb-2">Feature adoption (accounts using each)</h3>
          <ul className="flex flex-col gap-1 text-[13px]">
            {data.adoption.map((a) => (
              <li key={a.metric} className="flex justify-between"><span>{METRIC_LABEL[a.metric] ?? a.metric}</span><span className="font-mono">{a.users}</span></li>
            ))}
            {data.adoption.length === 0 && <li className="text-brand-muted">None yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

const SecurityTab: React.FC = () => {
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [user, setUser] = useState('');
  const [applied, setApplied] = useState({ type: '', severity: '', user: '' });
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useLoad(() => opsService.events({ ...applied, page }), [applied, page]);
  const addToast = useToast();
  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied({ type, severity, user: user.trim() }); }}>
        <select value={type} onChange={(e) => setType(e.target.value)} className={input} aria-label="Event type">
          <option value="">All events</option>
          <option value="auth.*">Sign-in activity</option>
          <option value="auth.login_failed">Failed sign-ins</option>
          <option value="account.*">Account changes</option>
          <option value="access.*">Blocked requests</option>
          <option value="admin.*">Console actions</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={input} aria-label="Severity">
          <option value="">Any severity</option><option value="high">High</option><option value="warning">Warning</option><option value="info">Info</option>
        </select>
        <input value={user} onChange={(e) => setUser(e.target.value)} className={`${input} flex-1 min-w-[180px]`} placeholder="Account email or id" aria-label="Account filter" />
        <button type="submit" className={`${btn} border-blue-200 text-blue-700`}><Search size={13} /> Filter</button>
        <button type="button" onClick={reload} className={`${btn} border-border`}><RefreshCw size={13} /></button>
        <button type="button" className={`${btn} border-border`}
          onClick={() => opsService.downloadSecurityCsv(applied).catch((e: Error) => addToast('error', e.message))}>
          <Download size={13} /> Export CSV
        </button>
      </form>
      <Problem message={error} />
      {loading ? <Spinner /> : data && (
        <div className={`${panel} p-0 sm:p-0 overflow-x-auto`}>
          <table className="w-full text-[12px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-brand-muted border-b border-border">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Account / subject</th><th className="px-3 py-2">Network</th><th className="px-3 py-2">Detail</th></tr>
            </thead>
            <tbody>
              {data.events.map((e: SecurityEvent) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmt(e.at)}</td>
                  <td className="px-3 py-1.5"><span className={`px-1.5 rounded mr-1.5 ${SEVERITY_CLASS[e.severity]}`}>{e.severity}</span><span className="font-mono">{e.type}</span></td>
                  <td className="px-3 py-1.5">{e.userEmail ?? e.subject ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">{e.ip ?? '—'}</td>
                  <td className="px-3 py-1.5 text-brand-muted max-w-[320px] break-words">{e.detail ? JSON.stringify(e.detail) : ''}</td>
                </tr>
              ))}
              {data.events.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-brand-muted">No events match.</td></tr>}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 text-[12px] text-brand-muted border-t border-border">
            <span>{data.total} events · IP addresses masked · kept 90 days</span>
            <span className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn} border-border`}>Previous</button>
              <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className={`${btn} border-border`}>Next</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const AlertsTab: React.FC = () => {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open');
  const { data, error, loading, reload } = useLoad<Alert[]>(() => opsService.alerts(status), [status]);
  const addToast = useToast();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(['open', 'resolved', 'all'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={`${btn} ${status === s ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-border text-brand-body'}`}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <Problem message={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? (
        <div className={`${panel} flex items-center gap-2 text-[13px] text-emerald-700`}><CheckCircle2 size={16} /> No {status === 'all' ? '' : status} alerts.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(data ?? []).map((a) => (
            <li key={a.id} className={`${panel} flex flex-wrap items-start justify-between gap-3`}>
              <div>
                <div className="flex items-center gap-2 font-semibold text-brand-heading text-[13.5px]">
                  <AlertTriangle size={15} className={a.status === 'open' ? 'text-red-500' : 'text-brand-muted'} />
                  {ALERT_LABEL[a.kind] ?? a.kind}
                </div>
                <div className="text-[12.5px] text-brand-body mt-0.5 font-mono">{a.subject}</div>
                <div className="text-[11.5px] text-brand-muted mt-0.5">
                  {fmt(a.at)}{a.detail ? ` · ${JSON.stringify(a.detail)}` : ''}
                  {a.resolved_at ? ` · resolved ${fmt(a.resolved_at)} by ${a.resolved_by}` : ''}
                </div>
              </div>
              {a.status === 'open' && (
                <button type="button" className={`${btn} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}
                  onClick={() => opsService.resolveAlert(a.id).then(() => { addToast('success', 'Alert resolved.'); reload(); })
                    .catch((e: Error) => addToast('error', e.message))}>
                  <CheckCircle2 size={13} /> Resolve
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ActionsTab: React.FC = () => {
  const { data, error, loading, reload } = useLoad(() => opsService.adminActions(), []);
  if (loading) return <Spinner />;
  if (error || !data) return <Problem message={error} />;
  return (
    <div className="flex flex-col gap-3">
      <div className={`${panel} flex flex-wrap items-center justify-between gap-2 text-[13px]`}>
        {data.chainValid ? (
          <span className="flex items-center gap-2 text-emerald-700 font-semibold"><Link2 size={15} /> Chain verified: {data.total} actions, none edited or removed.</span>
        ) : (
          <span className="flex items-center gap-2 text-red-700 font-semibold"><ShieldAlert size={15} /> Chain broken at action #{data.firstBrokenSeq}: the log was altered.</span>
        )}
        <button type="button" onClick={reload} className={`${btn} border-border`}><RefreshCw size={13} /> Re-verify</button>
      </div>
      <div className={`${panel} p-0 sm:p-0 overflow-x-auto`}>
        <table className="w-full text-[12px]">
          <thead className="text-left text-[11px] uppercase tracking-wider text-brand-muted border-b border-border">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">When</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Detail</th></tr>
          </thead>
          <tbody>
            {data.actions.map((a: AdminAction) => (
              <tr key={a.seq} className="border-b border-border/60 last:border-0 align-top">
                <td className="px-3 py-1.5 font-mono">{a.seq}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{fmt(a.at)}</td>
                <td className="px-3 py-1.5">{a.actor_email}</td>
                <td className="px-3 py-1.5 font-mono">{a.action}</td>
                <td className="px-3 py-1.5 text-brand-muted max-w-[360px] break-words">{a.detail ? JSON.stringify(a.detail) : ''}</td>
              </tr>
            ))}
            {data.actions.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-brand-muted">No console actions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────

export const OpsConsolePage: React.FC<{ onSignedOut?: () => void }> = ({ onSignedOut }) => {
  const [state, setState] = useState<{ role?: StaffRole; can?: Capabilities; error?: string; offline?: boolean }>({});
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    opsService.whoami()
      .then((me) => setState({ role: me.role, can: me.can }))
      .catch((e: OpsError) => {
        // Session expired or ended by another admin: back to the sign-in screen.
        if (e.status === 401 || e.status === 403) { onSignedOut?.(); return; }
        setState({ error: e.message, offline: e.status === 0 || e.status === 404 });
      });
  }, [onSignedOut]);

  if (state.offline) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className={panel}>
          <h1 className="text-[20px] font-bold text-brand-heading flex items-center gap-2"><Shield size={18} /> Operations console</h1>
          <p className="text-[14px] text-brand-body mt-2 leading-relaxed">
            The backend server could not be reached, or it does not allow this address.
          </p>
          <p className="text-[13px] text-brand-muted mt-2">
            Build this site with <span className="font-mono">VITE_API_BASE_URL</span> pointing at the backend, and set
            the backend's <span className="font-mono">ADMIN_ORIGIN</span> to this site's address (see <span className="font-mono">docs/OPS_CONSOLE.md</span>).
          </p>
        </div>
      </div>
    );
  }
  if (state.error) return <div className="max-w-2xl mx-auto px-4 py-16"><Problem message={state.error} /></div>;
  if (!state.can) return <div className="max-w-2xl mx-auto px-4 py-16"><Spinner /></div>;

  const can = state.can;
  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'overview', label: 'Overview', icon: <Activity size={14} />, show: true },
    { key: 'users', label: 'Users', icon: <Users size={14} />, show: true },
    { key: 'usage', label: 'Usage & traffic', icon: <BarChart3 size={14} />, show: true },
    { key: 'security', label: 'Security log', icon: <Shield size={14} />, show: can.viewSecurity },
    { key: 'alerts', label: 'Alerts', icon: <AlertTriangle size={14} />, show: can.viewSecurity },
    { key: 'actions', label: 'Console actions', icon: <Link2 size={14} />, show: can.viewSecurity },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted flex items-center gap-1.5">
            <Shield size={13} /> Internal · {state.role}
          </span>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-brand-heading tracking-tight">Operations console</h1>
        </div>
        <p className="text-[12px] text-brand-muted max-w-md">
          For the developer and cyber team. Every action here is logged in a tamper-evident record.
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border mb-5" aria-label="Console sections">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-brand-muted hover:text-brand-heading'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && <OverviewTab can={can} />}
      {tab === 'users' && <UsersTab can={can} />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'security' && can.viewSecurity && <SecurityTab />}
      {tab === 'alerts' && can.viewSecurity && <AlertsTab />}
      {tab === 'actions' && can.viewSecurity && <ActionsTab />}
    </div>
  );
};

export default OpsConsolePage;
