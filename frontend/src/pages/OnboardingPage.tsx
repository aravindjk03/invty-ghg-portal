import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SECTORS } from '../config/sectors';
import { AlertTriangle, Building2 } from 'lucide-react';

const ROLES = [
  'Sustainability / ESG Lead',
  'EHS Manager',
  'Plant / Operations Head',
  'Finance / Controller',
  'Compliance Officer',
  'Consultant / Auditor',
  'Other',
];

const EMPLOYEE_BANDS = ['1–50', '51–250', '251–1,000', '1,001–5,000', '5,000+'];

/**
 * Captured once, immediately after the first sign-in. The organisation details
 * seed the inventory (company name, sector, reporting period) so the user is
 * not asked for them again in Settings.
 */
export const OnboardingPage: React.FC = () => {
  const { user, saveProfile, signOut } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState(SECTORS[0].id as string);
  const [role, setRole] = useState(ROLES[0]);
  const [reportingPeriod, setReportingPeriod] = useState('FY 2025-26');
  const [country, setCountry] = useState('India');
  const [employeeBand, setEmployeeBand] = useState(EMPLOYEE_BANDS[2]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (companyName.trim().length < 2) {
      setError('Enter your organisation name.');
      return;
    }

    setBusy(true);
    try {
      await saveProfile({
        companyName: companyName.trim(),
        sector,
        role,
        reportingPeriod: reportingPeriod.trim(),
        country: country.trim() || undefined,
        employeeBand,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[560px]">
        <div className="bg-surface-raised border border-border rounded-lg shadow-nm-raised p-7">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-brand-primary">
              <Building2 size={18} />
            </div>
            <h1 className="text-lg font-bold text-brand-heading">Tell us about your organisation</h1>
          </div>
          <p className="text-xs text-brand-muted mb-6 leading-relaxed">
            Signed in as <strong className="text-brand-heading">{user?.email}</strong>. These details
            set your reporting boundary and decide which emission sources and sector guidance the
            workspace shows you. You can change any of them later in Settings.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">
                Legal entity name
              </label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Meridian Motors Pvt Ltd"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-brand-body mb-1">Sector</label>
                <Select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  options={SECTORS.map((s) => ({ value: s.id, label: s.label }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-body mb-1">Your role</label>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={ROLES.map((r) => ({ value: r, label: r }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-body mb-1">
                  Reporting period
                </label>
                <Input
                  value={reportingPeriod}
                  onChange={(e) => setReportingPeriod(e.target.value)}
                  placeholder="FY 2025-26"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-body mb-1">Country</label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-brand-body mb-1">
                  Employees
                </label>
                <Select
                  value={employeeBand}
                  onChange={(e) => setEmployeeBand(e.target.value)}
                  options={EMPLOYEE_BANDS.map((b) => ({ value: b, label: b }))}
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-xs"
              >
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="md" disabled={busy}>
                {busy ? 'Saving…' : 'Continue to the portal'}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
