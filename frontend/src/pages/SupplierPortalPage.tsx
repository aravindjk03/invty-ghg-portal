import React, { useState, useEffect } from 'react';
import { useGHG } from '../context/GHGContext';
import { complianceService } from '../services/complianceService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatIndianNumber } from '../engine/unitConverter';
import { 
  ArrowLeft, 
  Link2, 
  Send, 
  CheckCircle2, 
  Clock, 
  FileCheck, 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  Check, 
  Building2, 
  AlertCircle 
} from 'lucide-react';
import { SupplierInvitation } from '../types/compliance.types';

interface SupplierPortalPageProps {
  onNavigate: (page: string) => void;
}

const SCOPE_3_CATEGORIES = [
  { value: '1', label: 'Cat 1: Purchased Goods & Services' },
  { value: '2', label: 'Cat 2: Capital Goods' },
  { value: '4', label: 'Cat 4: Upstream Transportation & Distribution' },
  { value: '5', label: 'Cat 5: Waste Generated in Operations' },
  { value: '6', label: 'Cat 6: Business Travel' },
  { value: '7', label: 'Cat 7: Employee Commuting' },
  { value: '8', label: 'Cat 8: Upstream Leased Assets' },
  { value: '9', label: 'Cat 9: Downstream Transportation & Distribution' },
  { value: '10', label: 'Cat 10: Processing of Sold Products' },
  { value: '11', label: 'Cat 11: Use of Sold Products' },
  { value: '12', label: 'Cat 12: End-of-Life Treatment of Sold Products' },
  { value: '13', label: 'Cat 13: Downstream Leased Assets' },
  { value: '14', label: 'Cat 14: Franchises' },
  { value: '15', label: 'Cat 15: Investments' },
];

export const SupplierPortalPage: React.FC<SupplierPortalPageProps> = ({ onNavigate }) => {
  const { addToast, updateRow, scope3Entries } = useGHG();

  // Mode: 'enterprise' (admin overview) or 'supplier_form' (public vendor view)
  const [activeTab, setActiveTab] = useState<'enterprise' | 'supplier_form'>('enterprise');
  
  // Invitations state
  const [invitations, setInvitations] = useState<SupplierInvitation[]>([
    {
      id: 'inv-supp-001',
      token: 'tok_ea91b2c45d6f78e0',
      supplierName: 'BlueDart DHL Express Freight',
      supplierEmail: 'sustainability@bluedart-freight.com',
      scope3CategoryNumber: 4,
      categoryName: 'Upstream Transportation & Distribution',
      requestedItemDescription: 'Inbound raw steel coil linehaul freight (FY 2024-25)',
      purchaseOrderRef: 'PO-2024-LOG-8910',
      status: 'SUBMITTED',
      createdAt: '2026-04-01T10:00:00.000Z',
      expiresAt: '2026-05-01T10:00:00.000Z',
      submission: {
        supplierName: 'BlueDart DHL Express Freight Logistics Ltd',
        supplierCompanyPanOrEin: 'AAACB1234F',
        reportingPeriod: 'FY 2024-25',
        providedQuantity: 1250000,
        providedUnit: 't.km',
        primaryEmissionFactor: 0.089,
        factorUnit: 'kgCO2e / t.km',
        factorDataSource: 'ISO 14067 Product Carbon Footprint (Third-Party Verified by DNV)',
        calculatedTco2e: 111.25,
        evidenceFileName: 'BlueDart_Fleet_Carbon_Assurance_2024.pdf',
        submittedAt: '2026-04-03T15:20:00.000Z',
      },
    },
    {
      id: 'inv-supp-002',
      token: 'tok_3f88a109bc4d6211',
      supplierName: 'Jindal Pellet Plant Feedstock',
      supplierEmail: 'carbon.accounting@jindalfeedstock.in',
      scope3CategoryNumber: 1,
      categoryName: 'Purchased Goods and Services',
      requestedItemDescription: 'Direct reduced iron (DRI) pellets grade A',
      purchaseOrderRef: 'PO-2024-RAW-0042',
      status: 'PENDING',
      createdAt: '2026-04-03T12:00:00.000Z',
      expiresAt: '2026-05-03T12:00:00.000Z',
    },
  ]);

  // Modal: New invitation
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // Invitations live server-side; the seeded rows above are only a first paint.
  useEffect(() => {
    let cancelled = false;
    complianceService
      .getSupplierInvitations(() => [])
      .then(({ data, source }) => {
        if (cancelled || source !== 'api' || !Array.isArray(data) || data.length === 0) return;
        setInvitations(data as unknown as SupplierInvitation[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [newCategoryNum, setNewCategoryNum] = useState('1');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newPoRef, setNewPoRef] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Modal: Review submission
  const [selectedSubmission, setSelectedSubmission] = useState<SupplierInvitation | null>(null);

  // Public Vendor Form fields
  const [vendorTokenInput, setVendorTokenInput] = useState('tok_3f88a109bc4d6211');
  const [vendorCompanyName, setVendorCompanyName] = useState('Jindal Pellet Plant Pvt Ltd');
  const [vendorPan, setVendorPan] = useState('AABCP9876K');
  const [vendorQty, setVendorQty] = useState(450);
  const [vendorUnit, setVendorUnit] = useState('t');
  const [vendorFactor, setVendorFactor] = useState(1.42);
  const [vendorSource, setVendorSource] = useState('EPD Environmental Product Declaration (ISO 14025)');
  const [vendorSubmitted, setVendorSubmitted] = useState(false);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim() || !newSupplierEmail.trim() || !newItemDesc.trim()) {
      addToast('warning', 'Please fill in supplier name, email, and item description.');
      return;
    }

    const catObj = SCOPE_3_CATEGORIES.find((c) => c.value === newCategoryNum);
    const payload = {
      supplierName: newSupplierName.trim(),
      supplierEmail: newSupplierEmail.trim(),
      scope3CategoryNumber: parseInt(newCategoryNum, 10),
      categoryName: catObj ? catObj.label.split(': ')[1] : 'Purchased Goods',
      requestedItemDescription: newItemDesc.trim(),
      purchaseOrderRef: newPoRef.trim() || undefined,
    };

    // The token has to be issued server-side. Minting one in the browser
    // produced a link no server could ever verify, so the supplier could not
    // actually open it.
    let created: SupplierInvitation;
    try {
      created = (await complianceService.createSupplierInvitation(
        payload
      )) as unknown as SupplierInvitation;
      addToast('success', `Magic Link issued for ${created.supplierName}`);
    } catch {
      created = {
        ...payload,
        id: `inv-local-${Date.now()}`,
        token: `local-only-${Date.now()}`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      } as SupplierInvitation;
      addToast(
        'warning',
        'Saved locally — the supplier link is not live until the API is reachable.'
      );
    }

    setInvitations([created, ...invitations]);
    setInviteModalOpen(false);
    setNewSupplierName('');
    setNewSupplierEmail('');
    setNewItemDesc('');
    setNewPoRef('');
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/supplier-portal?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    addToast('info', 'Magic link copied to clipboard');
  };

  const handleApproveOverride = (inv: SupplierInvitation) => {
    if (!inv.submission) return;

    // Update invitation status
    setInvitations((prev) =>
      prev.map((item) =>
        item.id === inv.id
          ? {
              ...item,
              status: 'APPROVED',
              submission: {
                ...item.submission!,
                verifiedBy: 'Corporate GHG Lead (Primary Factor Verified)',
              },
            }
          : item
      )
    );

    // If an activity row matches, upgrade its factor and quality
    const targetRow = scope3Entries.find(
      (e) => e.fuelOrSource.toLowerCase().includes('freight') || e.fuelOrSource.toLowerCase().includes('steel')
    );

    if (targetRow) {
      updateRow('scope-3', targetRow.id, {
        amount: inv.submission.providedQuantity,
        unit: inv.submission.providedUnit,
        emissionFactor: {
          ...targetRow.emissionFactor,
          factorValue: inv.submission.primaryEmissionFactor,
          qualityTier: 'Primary',
          source: inv.submission.factorDataSource,
        },
      });
    }

    setSelectedSubmission(null);
    addToast('success', `Approved primary factor override for ${inv.supplierName}. Scope 3 upgraded to Grade A!`);
  };

  const handleVendorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const calculated = Number(((vendorQty * vendorFactor) / 1000).toFixed(2));

    setInvitations((prev) =>
      prev.map((i) =>
        i.token === vendorTokenInput
          ? {
              ...i,
              status: 'SUBMITTED',
              submission: {
                supplierName: vendorCompanyName,
                supplierCompanyPanOrEin: vendorPan,
                reportingPeriod: 'FY 2024-25',
                providedQuantity: vendorQty,
                providedUnit: vendorUnit,
                primaryEmissionFactor: vendorFactor,
                factorUnit: `kgCO2e / ${vendorUnit}`,
                factorDataSource: vendorSource,
                calculatedTco2e: calculated,
                evidenceFileName: 'Verified_EPD_Declaration.pdf',
                submittedAt: new Date().toISOString(),
              },
            }
          : i
      )
    );

    setVendorSubmitted(true);
    addToast('success', 'Supplier activity submitted successfully to client GHG registry.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => onNavigate('scope-3')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:text-brand-heading transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Scope 3 Workspace
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="scope3">Scope 3 Value Chain</Badge>
          <Badge variant="verified">Primary Data Overrides</Badge>
        </div>
      </div>

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-heading tracking-tight flex items-center gap-2.5">
            <Link2 size={24} className="text-brand-primary" />
            Scope 3 Supplier Engagement Portal ("Magic Links")
          </h1>
          <p className="text-sm text-brand-muted mt-1 max-w-3xl">
            Invite Tier-1 supply chain vendors via secure tokenized links. Collect verified primary emission factors directly, eliminating reliance on secondary spend proxies and upgrading Scope 3 data quality to Grade A.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-surface-sunken p-1 rounded-md border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('enterprise')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
              activeTab === 'enterprise'
                ? 'bg-surface-raised text-brand-link shadow-sm'
                : 'text-brand-muted hover:text-brand-body'
            }`}
          >
            Enterprise Admin ({invitations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('supplier_form')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
              activeTab === 'supplier_form'
                ? 'bg-surface-raised text-brand-link shadow-sm'
                : 'text-brand-muted hover:text-brand-body'
            }`}
          >
            Vendor Public Form View
          </button>
        </div>
      </div>

      {/* TAB 1: Enterprise Admin Dashboard */}
      {activeTab === 'enterprise' && (
        <div className="space-y-6">
          {/* Header Action Strip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-brand-muted">
              <ShieldCheck size={16} className="text-status-success" />
              <span>
                {invitations.filter((i) => i.status === 'APPROVED').length} approved overrides ·{' '}
                {invitations.filter((i) => i.status === 'SUBMITTED').length} pending review ·{' '}
                {invitations.filter((i) => i.status === 'PENDING').length} awaiting vendor submission
              </span>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setInviteModalOpen(true)}
              leftIcon={<Send size={14} />}
            >
              Generate Supplier Magic Link
            </Button>
          </div>

          {/* Invitations Table */}
          <Card className="bg-surface-raised border border-border shadow-nm-raised overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-sunken border-b border-border text-brand-muted uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Supplier / Vendor</th>
                    <th className="px-4 py-3 font-semibold">Scope 3 Category</th>
                    <th className="px-4 py-3 font-semibold">Requested Procurement Scope</th>
                    <th className="px-4 py-3 font-semibold">Magic Link Token</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-brand-heading">
                        <div>{inv.supplierName}</div>
                        <div className="text-[11px] text-brand-muted">{inv.supplierEmail}</div>
                      </td>
                      <td className="px-4 py-3.5 text-brand-body">
                        <span className="font-semibold text-brand-heading">Cat {inv.scope3CategoryNumber}:</span> {inv.categoryName}
                      </td>
                      <td className="px-4 py-3.5 text-brand-muted max-w-xs truncate">
                        {inv.requestedItemDescription}
                        {inv.purchaseOrderRef && (
                          <span className="block text-[10px] font-mono text-brand-muted">{inv.purchaseOrderRef}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-brand-muted">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv.token)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          {copiedToken === inv.token ? <Check size={12} /> : <Copy size={12} />}
                          <span>{inv.token.substring(0, 10)}...</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {inv.status === 'APPROVED' ? (
                          <Badge variant="verified">Grade A Approved</Badge>
                        ) : inv.status === 'SUBMITTED' ? (
                          <Badge variant="warning">Ready for Review</Badge>
                        ) : (
                          <Badge variant="default">Pending Vendor</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {inv.status === 'SUBMITTED' || inv.status === 'APPROVED' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedSubmission(inv)}
                          >
                            Inspect Submission
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyLink(inv.token)}
                            leftIcon={<Copy size={12} />}
                          >
                            Copy Link
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: Vendor Public Submission Form */}
      {activeTab === 'supplier_form' && (
        <div className="max-w-2xl mx-auto">
          <Card className="p-6 bg-surface-raised border border-border shadow-nm-raised">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Building2 size={20} className="text-brand-primary" />
                <div>
                  <h3 className="text-sm font-bold text-brand-heading">Supplier Carbon Data Submission</h3>
                  <span className="text-[11px] text-brand-muted">Secure Magic Link Portal · Token: {vendorTokenInput}</span>
                </div>
              </div>
              <Badge variant="primary">No Login Required</Badge>
            </div>

            {vendorSubmitted ? (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded text-center space-y-3">
                <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
                <h4 className="text-base font-bold text-emerald-950">Primary Carbon Data Received</h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto leading-relaxed">
                  Thank you. Your verified primary factor of <strong>{vendorFactor} kgCO₂e/{vendorUnit}</strong> for {vendorQty} {vendorUnit} has been logged. The enterprise buyer will review and lock the Grade A assurance record.
                </p>
                <Button variant="secondary" size="sm" onClick={() => setVendorSubmitted(false)}>
                  Submit Another Line
                </Button>
              </div>
            ) : (
              <form onSubmit={handleVendorSubmit} className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 leading-relaxed">
                  You have been invited by <strong>Acme Heavy Steels Ltd</strong> to provide verified greenhouse gas activity and emission factor data for Scope 3 procurement accounting.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Supplier Entity Legal Name *"
                    value={vendorCompanyName}
                    onChange={(e) => setVendorCompanyName(e.target.value)}
                    required
                  />
                  <Input
                    label="PAN / Tax Registration Number *"
                    value={vendorPan}
                    onChange={(e) => setVendorPan(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Supplied Quantity *"
                    type="number"
                    value={vendorQty}
                    onChange={(e) => setVendorQty(parseFloat(e.target.value) || 0)}
                    required
                  />
                  <Input
                    label="Unit of Measurement *"
                    value={vendorUnit}
                    onChange={(e) => setVendorUnit(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label={`Verified Emission Factor (kgCO2e / ${vendorUnit}) *`}
                    type="number"
                    value={vendorFactor}
                    onChange={(e) => setVendorFactor(parseFloat(e.target.value) || 0)}
                    step={0.001}
                    required
                  />
                  <Input
                    label="Data Verification Standard *"
                    value={vendorSource}
                    onChange={(e) => setVendorSource(e.target.value)}
                    required
                  />
                </div>

                <div className="p-3 bg-surface border border-border rounded flex items-center justify-between">
                  <div>
                    <span className="text-brand-muted block">Calculated Value-Chain Emissions:</span>
                    <span className="text-base font-mono font-bold text-brand-heading">
                      {formatIndianNumber(((vendorQty * vendorFactor) / 1000), 2)} tCO₂e
                    </span>
                  </div>
                  <Badge variant="verified">Primary Grade A</Badge>
                </div>

                <div className="pt-3 border-t border-border flex justify-end">
                  <Button variant="primary" size="md" type="submit" leftIcon={<Send size={16} />}>
                    Submit Verified Activity to Buyer
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}

      {/* MODAL: Generate New Supplier Magic Link */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Generate Supplier Magic Link Invitation"
      >
        <form onSubmit={handleCreateInvitation} className="space-y-4 text-xs">
          <Input
            label="Supplier / Vendor Company Name *"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="e.g. Jindal Steel Pellets Ltd"
            required
          />

          <Input
            label="Supplier Sustainability / Billing Contact Email *"
            type="email"
            value={newSupplierEmail}
            onChange={(e) => setNewSupplierEmail(e.target.value)}
            placeholder="e.g. esg.contact@jindalfeedstock.in"
            required
          />

          <Select
            label="Relevant Scope 3 Category *"
            value={newCategoryNum}
            onChange={(e) => setNewCategoryNum(e.target.value)}
            options={SCOPE_3_CATEGORIES}
          />

          <Input
            label="Procurement Description & Invoiced Items *"
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
            placeholder="e.g. Inbound DRI Pellets Lot 2024-Q3"
            required
          />

          <Input
            label="Purchase Order / Contract Reference (Optional)"
            value={newPoRef}
            onChange={(e) => setNewPoRef(e.target.value)}
            placeholder="e.g. PO-2024-RAW-0099"
          />

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" leftIcon={<Send size={14} />}>
              Generate Magic Link
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Review Submitted Supplier Data */}
      {selectedSubmission && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedSubmission(null)}
          title={`Review Primary Data — ${selectedSubmission.supplierName}`}
        >
          <div className="space-y-4 text-xs text-brand-body leading-relaxed">
            {selectedSubmission.submission ? (
              <>
                <div className="grid grid-cols-2 gap-3 p-3 bg-surface border border-border rounded">
                  <div>
                    <span className="text-brand-muted block">Supplier Entity:</span>
                    <span className="font-semibold text-brand-heading">{selectedSubmission.submission.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-brand-muted block">PAN / Tax ID:</span>
                    <span className="font-mono font-semibold text-brand-heading">{selectedSubmission.submission.supplierCompanyPanOrEin}</span>
                  </div>
                  <div>
                    <span className="text-brand-muted block">Primary Factor:</span>
                    <span className="font-mono font-bold text-brand-heading">
                      {selectedSubmission.submission.primaryEmissionFactor} {selectedSubmission.submission.factorUnit}
                    </span>
                  </div>
                  <div>
                    <span className="text-brand-muted block">Resulting Emissions:</span>
                    <span className="font-mono font-bold text-status-success text-sm">
                      {selectedSubmission.submission.calculatedTco2e} tCO₂e
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-brand-muted block font-semibold mb-1">Standard / Verification Source:</span>
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded font-medium text-blue-950">
                    {selectedSubmission.submission.factorDataSource}
                  </div>
                </div>

                {selectedSubmission.submission.evidenceFileName && (
                  <div className="flex items-center gap-2 p-2.5 bg-surface border border-border rounded">
                    <FileCheck size={16} className="text-status-success" />
                    <span className="font-medium text-brand-heading">{selectedSubmission.submission.evidenceFileName}</span>
                    <span className="text-[11px] text-brand-muted ml-auto">Verified Attachment</span>
                  </div>
                )}

                <div className="pt-3 border-t border-border flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSubmission(null)}>
                    Close
                  </Button>
                  {selectedSubmission.status !== 'APPROVED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApproveOverride(selectedSubmission)}
                      leftIcon={<CheckCircle2 size={14} />}
                    >
                      Approve Primary Override (Upgrade to Grade A)
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p>No submission recorded yet for this invitation.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
