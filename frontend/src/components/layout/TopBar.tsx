import React, { useState } from 'react';
import { useGHG } from '../../context/GHGContext';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { 
  HelpCircle, 
  Settings, 
  Save, 
  Home, 
  Flame, 
  Zap, 
  Link2, 
  BarChart3, 
  FileText, 
  CheckCircle2,
  BookOpen,
  LogIn,
  LogOut,
  User as UserIcon
} from 'lucide-react';

export interface TopBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentPage, onNavigate }) => {
  const { companyName, reportingPeriod, boundaryApproach, saveToStorage, currentUser, logout } = useGHG();
  const [helpOpen, setHelpOpen] = useState(false);

  const handleSaveAndExit = () => {
    saveToStorage();
    onNavigate('scope-hub');
  };

  return (
    <header className="sticky top-0 z-40 h-[72px] bg-surface-raised border-b border-border shadow-nm-raised-sm flex items-center">
      {/* Centered to match page container max-width exactly */}
      <div className="max-w-[1440px] mx-auto w-full px-6 flex items-center justify-between">
        {/* Left: INVTY Branding & Navigation */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onNavigate('scope-hub')}
            className="flex items-center gap-2.5 group focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md p-1"
          >
            <div className="w-9 h-9 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-nm-raised-sm">
              <span className="font-mono font-bold text-lg tracking-tighter">IV</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="font-mono font-bold text-base tracking-wider text-brand-heading leading-tight">
                INVTY
              </span>
              <span className="text-[10px] uppercase tracking-widest text-brand-muted font-semibold">
                GHG Portal
              </span>
            </div>
          </button>

          {/* Core Navigation Tabs - Clean, Corporate & Properly Spaced */}
          <nav className="flex items-center gap-1.5 bg-surface-sunken p-1.5 rounded-md border border-border shadow-nm-pressed text-xs">
            <button
              type="button"
              onClick={() => onNavigate('scope-hub')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'scope-hub'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <Home size={14} />
              <span>Hub</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scope-1')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'scope-1'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <Flame size={14} className="text-scope-1" />
              <span>Scope 1</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scope-2')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'scope-2'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <Zap size={14} className="text-scope-2" />
              <span>Scope 2</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scope-3')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'scope-3'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <Link2 size={14} className="text-scope-3" />
              <span>Scope 3</span>
            </button>

            {/* Subtle Divider */}
            <div className="h-4 w-px bg-border mx-1" />

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'dashboard'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <BarChart3 size={14} />
              <span>Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                currentPage === 'report'
                  ? 'bg-surface-raised text-brand-link shadow-nm-raised-sm font-semibold'
                  : 'text-brand-muted hover:text-brand-body'
              }`}
            >
              <FileText size={14} />
              <span>Report</span>
            </button>
          </nav>
        </div>

        {/* Centre: Company & Reporting Context */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-brand-muted bg-surface/90 px-3.5 py-1.5 rounded-md border border-border shadow-sm">
          <span className="font-semibold text-brand-heading">{companyName}</span>
          <span>·</span>
          <span>{reportingPeriod}</span>
          <span>·</span>
          <span className="flex items-center gap-1 text-brand-body">
            <CheckCircle2 size={12} className="text-status-success" />
            {boundaryApproach}
          </span>
        </div>

        {/* Right: Actions & User Session */}
        <div className="flex items-center gap-2.5">
          {currentUser ? (
            <div className="flex items-center gap-2 bg-surface/80 pl-2.5 pr-1.5 py-1 rounded-full border border-border text-xs">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px]">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="font-semibold text-brand-heading leading-tight truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-brand-muted font-medium">
                  {currentUser.role.replace('_', ' ')}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="w-7 h-7 rounded-full flex items-center justify-center text-brand-muted hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <Button
              variant={currentPage === 'login' ? 'primary' : 'secondary'}
              size="sm"
              leftIcon={<LogIn size={14} />}
              onClick={() => onNavigate('login')}
              className="font-medium"
            >
              Sign In
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Save size={14} />}
            onClick={handleSaveAndExit}
            className="hidden sm:inline-flex"
          >
            Save Draft
          </Button>

          <button
            type="button"
            aria-label="Settings & Boundaries"
            onClick={() => onNavigate('settings')}
            className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              currentPage === 'settings'
                ? 'bg-surface-raised text-brand-primary border-border shadow-nm-raised-sm'
                : 'text-brand-muted hover:text-brand-body hover:bg-blue-50 border-transparent hover:border-border'
            }`}
          >
            <Settings size={18} />
          </button>

          <button
            type="button"
            aria-label="Help and Documentation"
            onClick={() => setHelpOpen(true)}
            className="w-9 h-9 rounded-md flex items-center justify-center text-brand-muted hover:text-brand-body hover:bg-blue-50 border border-transparent hover:border-border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {/* Help & Standards Modal */}
      <Modal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="INVTY GHG Accounting Standards & Guidance"
      >
        <div className="space-y-4 text-xs text-brand-muted leading-relaxed">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
            <strong className="block font-semibold mb-1 text-blue-950">
              Regulatory Compliance Frameworks
            </strong>
            This portal executes calculations adhering strictly to the GHG Protocol Corporate Standard, ISO 14064-1:2018, and SEBI BRSR Core guidelines for Indian listed and industrial entities.
          </div>

          <div>
            <h4 className="font-bold text-brand-heading mb-1 flex items-center gap-1.5">
              <BookOpen size={14} /> Core Methodology Rules:
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Scope 2 Dual Reporting:</strong> Location-based and market-based figures are tracked side-by-side and never summed into the grand total.
              </li>
              <li>
                <strong>Auto-Derived Category 3:</strong> Well-to-tank (WTT) fuels and transmission loss emissions are automatically derived from Scope 1 and Scope 2 activity lines.
              </li>
              <li>
                <strong>Out-of-Scope Memos:</strong> Biogenic CO₂ and Montreal Protocol ODS gases (R-22) are reported separately as memo items and never added to Scope 1 gross.
              </li>
              <li>
                <strong>Precision Arithmetic:</strong> Decimal math is enforced to prevent IEEE 754 floating-point drift across large industrial inventories.
              </li>
            </ul>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setHelpOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  );
};
