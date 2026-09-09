import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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
  Lock,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface NavItem {
  icon: LucideIcon;
  label: string;
  page: string;
  gradient: string;
  activeTextClass: string;
  activeIconStyle: React.CSSProperties;
}

// ─── Nav items ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    icon: Home,
    label: 'Hub',
    page: 'scope-hub',
    gradient: 'linear-gradient(135deg,rgba(59,130,246,0.18),rgba(99,102,241,0.18))',
    activeTextClass: 'text-blue-700',
    activeIconStyle: { color: '#1d4ed8' },
  },
  {
    icon: Flame,
    label: 'Scope 1',
    page: 'scope-1',
    gradient: 'linear-gradient(135deg,rgba(239,68,68,0.18),rgba(234,88,12,0.18))',
    activeTextClass: 'text-red-600',
    activeIconStyle: { color: '#dc2626' },
  },
  {
    icon: Zap,
    label: 'Scope 2',
    page: 'scope-2',
    gradient: 'linear-gradient(135deg,rgba(202,138,4,0.18),rgba(250,204,21,0.18))',
    activeTextClass: 'text-yellow-600',
    activeIconStyle: { color: '#ca8a04' },
  },
  {
    icon: Link2,
    label: 'Scope 3',
    page: 'scope-3',
    gradient: 'linear-gradient(135deg,rgba(22,163,74,0.18),rgba(16,185,129,0.18))',
    activeTextClass: 'text-emerald-600',
    activeIconStyle: { color: '#16a34a' },
  },
  {
    icon: BarChart3,
    label: 'Dashboard',
    page: 'dashboard',
    gradient: 'linear-gradient(135deg,rgba(147,51,234,0.18),rgba(139,92,246,0.18))',
    activeTextClass: 'text-purple-600',
    activeIconStyle: { color: '#9333ea' },
  },
  {
    icon: FileText,
    label: 'Report',
    page: 'report',
    gradient: 'linear-gradient(135deg,rgba(2,132,199,0.18),rgba(6,182,212,0.18))',
    activeTextClass: 'text-sky-600',
    activeIconStyle: { color: '#0284c7' },
  },
];

// ─── Framer-motion animation variants ────────────────────────────────────────────

const frontVariants = {
  initial: { rotateX: 0, opacity: 1 },
  hover: {
    rotateX: -90,
    opacity: 0,
    transition: { type: 'spring', stiffness: 100, damping: 20, duration: 0.5 },
  },
};

const backVariants = {
  initial: { rotateX: 90, opacity: 0 },
  hover: {
    rotateX: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 100, damping: 20, duration: 0.5 },
  },
};

const navBgGlow = {
  initial: { opacity: 0 },
  hover: {
    opacity: 1,
    transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] as [number,number,number,number] },
  },
};

// ─── Single animated nav pill ────────────────────────────────────────────────────

interface NavPillProps {
  item: NavItem;
  isActive: boolean;
  onNavigate: (page: string) => void;
}

function NavPill({ item, isActive, onNavigate }: NavPillProps) {
  const Icon = item.icon;

  return (
    <li className="relative list-none">
      <motion.div
        className="relative rounded-xl"
        style={{ perspective: '600px' }}
        whileHover="hover"
        initial="initial"
      >
        {/* Coloured glow behind the pill (active = always visible, else on hover) */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ background: item.gradient, zIndex: 0 }}
          animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
          whileHover={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />

        <button
          type="button"
          onClick={() => onNavigate(item.page)}
          className="relative z-10 block focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl overflow-hidden"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {/* Front face */}
          <motion.div
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl',
              isActive ? item.activeTextClass : 'text-[#64748b]',
            )}
            variants={frontVariants}
            style={{ transformStyle: 'preserve-3d', transformOrigin: 'center bottom' }}
          >
            <Icon
              className="h-[15px] w-[15px] flex-shrink-0"
              style={isActive ? item.activeIconStyle : undefined}
            />
            <span className="hidden lg:inline leading-none">{item.label}</span>
          </motion.div>

          {/* Back face – appears on flip */}
          <motion.div
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl absolute inset-0',
              item.activeTextClass,
            )}
            variants={backVariants}
            style={{
              transformStyle: 'preserve-3d',
              transformOrigin: 'center top',
              rotateX: 90,
            }}
          >
            <Icon
              className="h-[15px] w-[15px] flex-shrink-0"
              style={item.activeIconStyle}
            />
            <span className="hidden lg:inline leading-none">{item.label}</span>
          </motion.div>
        </button>
      </motion.div>
    </li>
  );
}

// ─── Desktop animated menu bar ───────────────────────────────────────────────────

interface AnimatedMenuBarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

function AnimatedMenuBar({ activePage, onNavigate }: AnimatedMenuBarProps) {
  return (
    <motion.nav
      className="relative flex items-center gap-0.5 px-1.5 py-1.5 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] shadow-[0_1px_3px_0_rgb(15_23_42/0.07)]"
      initial="initial"
      whileHover="hover"
      style={{ overflow: 'visible' }}
    >
      {/* Subtle rainbow radial glow across the whole nav on hover */}
      <motion.div
        className="absolute -inset-3 rounded-3xl pointer-events-none"
        variants={navBgGlow}
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(59,130,246,0.08) 0%, rgba(168,85,247,0.06) 50%, transparent 100%)',
          zIndex: -1,
        }}
      />

      <ul className="flex items-center gap-0.5 m-0 p-0">
        {NAV_ITEMS.map((item) => (
          <NavPill
            key={item.page}
            item={item}
            isActive={item.page === activePage}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </motion.nav>
  );
}

// ─── Mobile bottom-sheet drawer ──────────────────────────────────────────────────

interface MobileDrawerProps {
  open: boolean;
  activePage: string;
  onNavigate: (page: string) => void;
  onClose: () => void;
}

function MobileDrawer({ open, activePage, onNavigate, onClose }: MobileDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            key="drawer"
            className="fixed top-[72px] inset-x-0 z-50 bg-white border-b border-[#E2E8F0] shadow-[0_8px_24px_-4px_rgb(15_23_42/0.14)] px-5 py-4"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-w-lg mx-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.page === activePage;
                return (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => { onNavigate(item.page); onClose(); }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-[11px] font-semibold transition-all',
                      isActive ? item.activeTextClass : 'text-[#64748b] hover:bg-[#F1F5F9] hover:text-[#0F172A]',
                    )}
                    style={isActive ? { background: item.gradient } : undefined}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={isActive ? item.activeIconStyle : undefined}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────────

export interface TopBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentPage, onNavigate }) => {
  const { companyName, reportingPeriod, boundaryApproach, saveToStorage, currentUser, logout } =
    useGHG();
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSave = () => { saveToStorage(); onNavigate('scope-hub'); };
  const handleLogout = async () => { await logout(); onNavigate('login'); };

  return (
    <>
      {/* ── Main header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-[64px] bg-[#FFFFFF] border-b border-[#E2E8F0] shadow-[0_1px_3px_0_rgb(15_23_42/0.06)] flex items-center">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 flex items-center gap-3">

          {/* ── LOGO ─────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => onNavigate(currentUser ? 'scope-hub' : 'login')}
            className="flex-shrink-0 flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600 py-1 pr-2"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
              <span className="font-mono font-bold text-[15px] tracking-tighter">IV</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="font-mono font-bold text-[13px] tracking-wider text-[#0F172A] leading-tight">
                INVTY
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[#94A3B8] font-semibold leading-tight">
                GHG Portal
              </span>
            </div>
          </button>

          {/* ── Divider ──────────────────────────────────────── */}
          <div className="hidden md:block w-px h-7 bg-[#E2E8F0] flex-shrink-0" />

          {/* ── DESKTOP NAV ──────────────────────────────────── */}
          {currentUser ? (
            <div className="hidden md:flex items-center flex-shrink-0">
              <AnimatedMenuBar activePage={currentPage} onNavigate={onNavigate} />
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg font-semibold flex-shrink-0">
              <Lock size={11} className="flex-shrink-0" />
              <span>Sign in required</span>
            </div>
          )}

          {/* ── SPACER (pushes right content to edge) ────────── */}
          <div className="flex-1" />

          {/* ── CONTEXT PILL (centre-ish, desktop only) ──────── */}
          {currentUser && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-[#64748B] bg-[#F1F5F9] px-3 py-1.5 rounded-full border border-[#E2E8F0] max-w-[260px] xl:max-w-[340px] overflow-hidden flex-shrink min-w-0">
              <span className="font-semibold text-[#0F172A] truncate shrink-0 max-w-[100px]">{companyName}</span>
              <span className="text-[#CBD5E1] flex-shrink-0">·</span>
              <span className="truncate flex-shrink min-w-0">{reportingPeriod}</span>
              <span className="text-[#CBD5E1] flex-shrink-0">·</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                <span className="hidden xl:inline truncate">{boundaryApproach}</span>
              </span>
            </div>
          )}

          {/* ── RIGHT ACTIONS ─────────────────────────────────── */}
          <div className="flex items-center gap-1.5 flex-shrink-0">

            {currentUser ? (
              <>
                {/* User avatar pill */}
                <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-full pl-1 pr-1 py-1 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[12px] flex-shrink-0">
                    {currentUser.name?.charAt(0).toUpperCase() ?? 'U'}
                  </div>
                  <div className="hidden sm:flex flex-col text-left pr-1">
                    <span className="text-[12px] font-semibold text-[#0F172A] leading-tight truncate max-w-[90px]">
                      {currentUser.name}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] font-medium leading-tight">
                      {currentUser.role.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign out"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[#94A3B8] hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={13} />
                  </button>
                </div>

                {/* Save — hidden on mobile */}
                <button
                  type="button"
                  onClick={handleSave}
                  className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white text-[#334155] text-xs font-medium hover:bg-[#F1F5F9] hover:border-[#CBD5E1] transition-colors shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]"
                >
                  <Save size={13} />
                  <span>Save</span>
                </button>

                {/* Settings */}
                <button
                  type="button"
                  aria-label="Settings"
                  onClick={() => onNavigate('settings')}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600',
                    currentPage === 'settings'
                      ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'text-[#94A3B8] hover:text-[#334155] hover:bg-[#F1F5F9] border-transparent hover:border-[#E2E8F0]',
                  )}
                >
                  <Settings size={15} />
                </button>

                {/* Mobile hamburger */}
                <button
                  type="button"
                  aria-label="Toggle navigation"
                  onClick={() => setMobileOpen((v) => !v)}
                  className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] border border-transparent hover:border-[#E2E8F0] transition-colors"
                >
                  {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <LogIn size={13} />
                <span>Sign In</span>
              </button>
            )}

            {/* Help */}
            <button
              type="button"
              aria-label="Help"
              onClick={() => setHelpOpen(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#334155] hover:bg-[#F1F5F9] border border-transparent hover:border-[#E2E8F0] transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <HelpCircle size={15} />
            </button>
          </div>

        </div>
      </header>

      {/* ── Mobile nav drawer ──────────────────────────────────────── */}
      {currentUser && (
        <MobileDrawer
          open={mobileOpen}
          activePage={currentPage}
          onNavigate={onNavigate}
          onClose={() => setMobileOpen(false)}
        />
      )}

      {/* ── Help modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="INVTY GHG Accounting Standards & Guidance"
      >
        <div className="space-y-4 text-xs text-[#64748B] leading-relaxed">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
            <strong className="block font-semibold mb-1 text-blue-950">
              Regulatory Compliance Frameworks
            </strong>
            This portal executes calculations adhering strictly to the GHG Protocol Corporate
            Standard, ISO 14064-1:2018, and SEBI BRSR Core guidelines for Indian listed and
            industrial entities.
          </div>
          <div>
            <h4 className="font-bold text-[#0F172A] mb-1 flex items-center gap-1.5">
              <BookOpen size={14} /> Core Methodology Rules:
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Scope 2 Dual Reporting:</strong> Location-based and market-based figures are tracked side-by-side and never summed into the grand total.</li>
              <li><strong>Auto-Derived Category 3:</strong> Well-to-tank (WTT) fuels and transmission loss emissions are automatically derived from Scope 1 and Scope 2 activity lines.</li>
              <li><strong>Out-of-Scope Memos:</strong> Biogenic CO₂ and Montreal Protocol ODS gases (R-22) are reported separately as memo items and never added to Scope 1 gross.</li>
              <li><strong>Precision Arithmetic:</strong> Decimal math is enforced to prevent IEEE 754 floating-point drift across large industrial inventories.</li>
            </ul>
          </div>
          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setHelpOpen(false)}>Got it</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
