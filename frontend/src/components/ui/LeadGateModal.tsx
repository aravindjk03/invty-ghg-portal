import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { CustomerLead, LeadSubmissionPayload } from '../../types/leads.types';
import { ShieldCheck, Lock, Download, CheckCircle2 } from 'lucide-react';

export interface LeadGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (lead: LeadSubmissionPayload) => void;
  title?: string;
  description?: string;
  actionType?: 'pdf' | 'cbam' | 'brsr' | 'cloud_save';
  inventorySummary?: {
    totalTco2e: number;
    scope1: number;
    scope2: number;
    scope3: number;
    qualityGrade: string;
  };
}

const SECTOR_OPTIONS = [
  { value: 'Steel & Ferroalloys', label: 'Steel & Ferroalloys' },
  { value: 'Cement & Building Materials', label: 'Cement & Building Materials' },
  { value: 'Aluminium & Non-Ferrous Metals', label: 'Aluminium & Non-Ferrous Metals' },
  { value: 'Chemicals & Fertilisers', label: 'Chemicals & Fertilisers' },
  { value: 'Thermal Power & Energy', label: 'Thermal Power & Energy' },
  { value: 'Automotive & Heavy Engineering', label: 'Automotive & Heavy Engineering' },
  { value: 'Logistics & Freight Transport', label: 'Logistics & Freight Transport' },
  { value: 'Information Technology & Services', label: 'Information Technology & Services' },
  { value: 'Other Industrial Manufacturing', label: 'Other Industrial Manufacturing' },
];

const NEED_OPTIONS = [
  { value: 'cbam', label: 'EU CBAM Compliance & Customs XML Export' },
  { value: 'brsr', label: 'SEBI BRSR Core Mandate (Top 1,000 Listed)' },
  { value: 'scope3', label: 'Scope 3 Supply Chain Primary Engagement' },
  { value: 'netzero', label: 'SBTi 1.5°C Trajectory & Decarbonisation' },
  { value: 'audit', label: 'ISO 14064-3 Third-Party Assurance' },
  { value: 'general', label: 'Corporate GHG Accounting & ESG Disclosure' },
];

export const LeadGateModal: React.FC<LeadGateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Enterprise Verification & Report Delivery',
  description = 'Register your organization profile to unlock verified audit packages, regulatory XML/XBRL exports, and immutable assurance records.',
  actionType = 'pdf',
  inventorySummary,
}) => {
  const [name, setName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('Steel & Ferroalloys');
  const [primaryNeed, setPrimaryNeed] = useState('cbam');
  const [phone, setPhone] = useState('');
  const [annualScale, setAnnualScale] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !workEmail.trim() || !companyName.trim()) {
      setErrorMsg('Please complete all required fields (Name, Corporate Email, and Company).');
      return;
    }

    if (!workEmail.includes('@') || workEmail.endsWith('@gmail.com') || workEmail.endsWith('@yahoo.com')) {
      setErrorMsg('Please enter a valid corporate / business email address.');
      return;
    }

    const payload: LeadSubmissionPayload = {
      name: name.trim(),
      workEmail: workEmail.trim().toLowerCase(),
      companyName: companyName.trim(),
      sector,
      primaryNeed,
      phone: phone.trim() || undefined,
      annualTurnoverOrProduction: annualScale.trim() || undefined,
      referralSource: window.location.search.includes('ref=portfolio') ? 'portfolio' : 'direct',
      inventoryStats: inventorySummary,
    };

    setIsSubmitting(true);
    try {
      // POST to backend lead capture API
      await fetch('http://localhost:5000/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Store in localStorage to avoid repeated prompts in same session
      localStorage.setItem('INVTY_LEAD_PROFILE', JSON.stringify(payload));
      setIsSubmitting(false);
      onSuccess(payload);
    } catch {
      // Fallback: save locally and permit download even if backend offline
      localStorage.setItem('INVTY_LEAD_PROFILE', JSON.stringify(payload));
      setIsSubmitting(false);
      onSuccess(payload);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 text-xs text-brand-muted leading-relaxed">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-blue-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-blue-950 block">{description}</span>
            <span className="text-[11px] text-blue-800 mt-0.5 block">
              Adheres strictly to ISO 14064-1, EU Regulation 2023/1773, and SEBI BRSR assurance guidelines.
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Full Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rajesh Sharma"
              required
            />
            <Input
              label="Corporate Work Email *"
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="e.g. r.sharma@tata-heavy-eng.com"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Company / Enterprise Legal Name *"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Tata Heavy Engineering Ltd"
              required
            />
            <Select
              label="Industry Sector *"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              options={SECTOR_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Primary Regulatory or Carbon Focus *"
              value={primaryNeed}
              onChange={(e) => setPrimaryNeed(e.target.value)}
              options={NEED_OPTIONS}
            />
            <Input
              label="Annual Production / Turnover (Optional)"
              value={annualScale}
              onChange={(e) => setAnnualScale(e.target.value)}
              placeholder="e.g. 500,000 tonnes / 1,200 Cr INR"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-brand-muted">
              <Lock size={12} />
              <span>Enterprise encrypted · No third-party data sharing</span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isSubmitting}
                leftIcon={<Download size={14} />}
              >
                {isSubmitting ? 'Verifying...' : 'Unlock & Download Report'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};
