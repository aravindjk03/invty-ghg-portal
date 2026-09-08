import React, { useState } from 'react';
import { useGHG } from '../context/GHGContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Badge } from '../components/ui/Badge';
import { ghgService } from '../services/ghgService';
import { 
  Building2, 
  Calendar, 
  ShieldCheck, 
  Database, 
  RefreshCw, 
  Download, 
  Upload, 
  Trash2, 
  ArrowLeft,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { ConsolidationBoundary, IntegratedSteelMethod } from '../engine/scopeRouter';

interface SettingsPageProps {
  onNavigate: (page: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const {
    companyName,
    reportingPeriod,
    boundaryApproach,
    steelMethod,
    setCompanyName,
    setReportingPeriod,
    setBoundaryApproach,
    setSteelMethod,
    scope1Entries,
    scope2Entries,
    scope3Entries,
    summary,
    recalculateAll,
    resetToDefaults,
    saveToStorage,
    addToast,
  } = useGHG();

  const [useIndianFormat, setUseIndianFormat] = useState(true);

  const handleExportBackup = () => {
    const backupData = {
      companyName,
      reportingPeriod,
      boundaryApproach,
      steelMethod,
      scope1Entries,
      scope2Entries,
      scope3Entries,
      summary,
      exportedAt: new Date().toISOString(),
      version: '2.0.0',
    };
    ghgService.exportJson(backupData, `${companyName.replace(/\s+/g, '_')}_GHG_Backup.json`);
    addToast('success', 'Complete inventory backup JSON exported');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.scope1Entries) {
          localStorage.setItem('INVTY_GHG_INVENTORY_DATA_V2_S1', JSON.stringify(json.scope1Entries));
        }
        if (json.scope2Entries) {
          localStorage.setItem('INVTY_GHG_INVENTORY_DATA_V2_S2', JSON.stringify(json.scope2Entries));
        }
        if (json.scope3Entries) {
          localStorage.setItem('INVTY_GHG_INVENTORY_DATA_V2_S3', JSON.stringify(json.scope3Entries));
        }
        addToast('success', 'Backup restored successfully. Reloading context...');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        addToast('error', 'Invalid JSON backup file format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => onNavigate('scope-hub')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-heading transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Hub
        </button>
        <Badge variant="verified">Configuration & Governance</Badge>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-heading tracking-tight">
          System Settings & Organisational Boundaries
        </h1>
        <p className="text-sm text-brand-muted mt-1">
          Configure corporate reporting parameters, greenhouse gas protocol consolidation boundaries, industrial method flags, and inventory data backups.
        </p>
      </div>

      <div className="space-y-6">
        {/* Section 1: Corporate Profile */}
        <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-brand-primary" />
            <h2 className="text-base font-bold text-brand-heading">
              1. Corporate Profile & Reporting Period
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">
                Legal Entity Name
              </label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Steel Pvt Ltd"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">
                Reporting Financial Period
              </label>
              <Input
                value={reportingPeriod}
                onChange={(e) => setReportingPeriod(e.target.value)}
                placeholder="e.g. FY 2025–26"
              />
              <span className="text-[11px] text-brand-muted mt-1 block">
                Indian Standard Financial Year (1 April – 31 March)
              </span>
            </div>
          </div>
        </Card>

        {/* Section 2: Consolidation Boundary & Scope Rules */}
        <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h2 className="text-base font-bold text-brand-heading">
              2. Consolidation Boundary & Method Flags
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brand-body mb-1">
                GHG Protocol Consolidation Boundary Approach
              </label>
              <Select
                value={boundaryApproach}
                onChange={(e) => setBoundaryApproach(e.target.value as ConsolidationBoundary)}
                options={[
                  { value: 'Operational control', label: 'Operational Control (Recommended for Industrial Plants)' },
                  { value: 'Financial control', label: 'Financial Control' },
                  { value: 'Equity share', label: 'Equity Share' },
                ]}
              />
              <p className="text-[11px] text-brand-muted mt-1.5 leading-relaxed">
                Under <strong>Operational Control</strong>, 100% of emissions from facilities where Acme Steel holds authority to introduce operating policies are accounted under Scope 1 and Scope 2. Leased assets outside this boundary route to Category 8.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-brand-body mb-1">
                Integrated Steel Emission Accounting Method (IPCC Vol 3 Ch 4)
              </label>
              <Select
                value={steelMethod}
                onChange={(e) => setSteelMethod(e.target.value as IntegratedSteelMethod)}
                options={[
                  { value: 'fuel_based', label: 'Fuel-Based Individual Tracking (Detailed DG, Gas & Furnace rows)' },
                  { value: 'carbon_balance', label: 'Carbon Mass Balance (Total Carbon Inflow minus Output)' },
                ]}
              />
              <p className="text-[11px] text-brand-muted mt-1.5 leading-relaxed">
                Enforces Bug Guard Rule #6: The engine blocks simultaneous entry of carbon mass balance reductants and individual recovered process gases (BF/CO/LD gas) to prevent double counting.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 3: Data Management & Backup */}
        <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-brand-primary" />
            <h2 className="text-base font-bold text-brand-heading">
              3. Inventory Data Persistence & Recovery
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-brand-heading mb-1">Export Full JSON Backup</h3>
                <p className="text-[11px] text-brand-muted mb-4">
                  Export complete verified dataset including custom factors, notes, and calculation logs.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportBackup}
                leftIcon={<Download size={14} />}
              >
                Download JSON Backup
              </Button>
            </div>

            <div className="p-4 rounded-xl bg-surface border border-border flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-brand-heading mb-1">Restore from Backup</h3>
                <p className="text-[11px] text-brand-muted mb-4">
                  Restore previously exported JSON backup file into browser local storage.
                </p>
              </div>
              <label className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-surface hover:bg-slate-100 border border-border text-brand-body text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow-nm-flat">
                <Upload size={14} />
                <span>Select Backup File</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={recalculateAll}
              leftIcon={<RefreshCw size={14} />}
              className="text-xs text-brand-primary"
            >
              Recalculate All Emissions with Latest Factors
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              leftIcon={<Trash2 size={14} />}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Reset to Acme Steel Factory Baseline
            </Button>
          </div>
        </Card>

        {/* 4. Captured Enterprise Leads (Portfolio & Report Ingestion) */}
        <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
            <div>
              <h2 className="text-sm font-bold text-brand-heading uppercase tracking-wider flex items-center gap-2">
                <Database size={16} className="text-brand-primary" />
                Portfolio Customer Ingestion & Captured Leads
              </h2>
              <p className="text-xs text-brand-muted mt-0.5">
                Prospective enterprise clients redirected from your portfolio website who unlocked reports or requested verified exports.
              </p>
            </div>
            <Badge variant="verified">CRM Synchronized</Badge>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-surface border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-brand-heading block">Tata Heavy Engineering Ltd</span>
                <span className="text-brand-muted">r.sharma@tata-heavy-eng.com · Manufacturing · Ref: Portfolio</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="primary">Scope 3 Audit</Badge>
                <span className="text-[11px] font-mono text-brand-muted">2 days ago</span>
              </div>
            </div>

            <div className="p-3 bg-surface border border-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-brand-heading block">JSW Specialty Alloys Division</span>
                <span className="text-brand-muted">a.verma@jsw-specialty-alloys.in · Steel · Ref: Portfolio</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="warning">ISO 14064 Assurance</Badge>
                <span className="text-[11px] font-mono text-brand-muted">Yesterday</span>
              </div>
            </div>

            {localStorage.getItem('INVTY_LEAD_PROFILE') && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-brand-heading block">
                    {JSON.parse(localStorage.getItem('INVTY_LEAD_PROFILE') || '{}').companyName || 'Recent Active Session'}
                  </span>
                  <span className="text-brand-muted">
                    {JSON.parse(localStorage.getItem('INVTY_LEAD_PROFILE') || '{}').workEmail} · Sector: {JSON.parse(localStorage.getItem('INVTY_LEAD_PROFILE') || '{}').sector}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="verified">Active Session Lead</Badge>
                  <span className="text-[11px] font-mono text-blue-800">Just Now</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Sticky Save Bar */}
      <div className="mt-8 flex justify-end gap-3">
        <Button
          variant="secondary"
          size="md"
          onClick={() => onNavigate('scope-hub')}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            saveToStorage();
            onNavigate('scope-hub');
          }}
          leftIcon={<CheckCircle size={16} />}
        >
          Save Settings & Return
        </Button>
      </div>
    </div>
  );
};
