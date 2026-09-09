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

// ─── Animated MenuBar (adapted from provided component) ────────────────────────

interface NavItem {
  icon: LucideIcon;
  label: string;
  page: string;
  gradient: string;
  iconColor: string;
}

const itemVariants = {
  initial: { rotateX: 0, opacity: 1 },
  hover: { rotateX: -90, opacity: 0 },
};

const backVariants = {
  initial: { rotateX: 90, opacity: 0 },
  hover: { rotateX: 0, opacity: 1 },
};

const glowVariants = {
  initial: { opacity: 0, scale: 0.8 },
  hover: {
    opacity: 1,
    scale: 2,
    transition: {
      opacity: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
      scale: { duration: 0.5, type: 'spring', stiffness: 300, damping: 25 },
    },
  },
};

const navGlowVariants = {
  initial: { opacity: 0 },
  hover: {
    opacity: 1,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
};

const sharedTransition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
  duration: 0.5,
};

interface AnimatedNavProps {
  items: NavItem[];
  activePage: string;
  onNavigate: (page: string) => void;
}

function AnimatedMenuBar({ items, activePage, onNavigate }: AnimatedNavProps) {
  return (
    <motion.nav
      className="p-1.5 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-lg border border-gray-200/60 shadow-lg relative overflow-hidden"
      initial="initial"
      whileHover="hover"
    >
      {/* Radial rainbow glow on nav hover */}
      <motion.div
        className="absolute -inset-2 rounded-3xl z-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 0%, rgba(59,130,246,0.15) 30%, rgba(168,85,247,0.12) 60%, rgba(239,68,68,0.10) 90%, transparent 100%)',
        }}
        variants={navGlowVariants}
      />

      <ul className="flex items-center gap-0.5 relative z-10">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.page === activePage;

          return (
            <motion.li key={item.page} className="relative">
              <button
                type="button"
                onClick={() => onNavigate(item.page)}
                className="block w-full focus-visible:outline-2 focus-visible:outline-blue-600 rounded-xl"
              >
                <motion.div
                  className="block rounded-xl overflow-visible group relative"
                  style={{ perspective: '600px' }}
                  whileHover="hover"
                  initial="initial"
                >
                  {/* Active / hover glow blob */}
                  <motion.div
                    className="absolute inset-0 z-0 pointer-events-none rounded-xl"
                    variants={glowVariants}
                    animate={isActive ? 'hover' : 'initial'}
                    style={{
                      background: item.gradient,
                      borderRadius: '12px',
                    }}
                  />

                  {/* Front face */}
                  <motion.div
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 relative z-10 bg-transparent rounded-xl text-xs font-medium transition-colors',
                      isActive ? 'text-gray-900' : 'text-gray-500 group-hover:text-gray-800',
                    )}
                    variants={itemVariants}
                    transition={sharedTransition}
                    style={{ transformStyle: 'preserve-3d', transformOrigin: 'center bottom' }}
                  >
                    <span
                      className={cn(
                        'transition-colors duration-300',
                        isActive ? item.iconColor : 'text-gray-500',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </motion.div>

                  {/* Back face (flip reveal) */}
                  <motion.div
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 absolute inset-0 z-10 bg-transparent rounded-xl text-xs font-medium transition-colors',
                      isActive ? 'text-gray-900' : 'text-gray-500 group-hover:text-gray-800',
                    )}
                    variants={backVariants}
                    transition={sharedTransition}
                    style={{
                      transformStyle: 'preserve-3d',
                      transformOrigin: 'center top',
                      rotateX: 90,
                    }}
                  >
                    <span className={cn('transition-colors duration-300', item.iconColor)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </motion.div>
                </motion.div>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </motion.nav>
  );
}

// ─── Nav item definitions ───────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    icon: Home,
    label: 'Hub',
    page: 'scope-hub',
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(99,102,241,0.35))',
    iconColor: 'text-blue-600',
  },
  {
    icon: Flame,
    label: 'Scope 1',
    page: 'scope-1',
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(234,88,12,0.35))',
    iconColor: 'text-red-500',
  },
  {
    icon: Zap,
    label: 'Scope 2',
    page: 'scope-2',
    gradient: 'linear-gradient(135deg, rgba(234,179,8,0.35), rgba(250,204,21,0.35))',
    iconColor: 'text-yellow-500',
  },
  {
    icon: Link2,
    label: 'Scope 3',
    page: 'scope-3',
    gradient: 'linear-gradient(135deg, rgba(34,197,94,0.35), rgba(16,185,129,0.35))',
    iconColor: 'text-emerald-500',
  },
  {
    icon: BarChart3,
    label: 'Dashboard',
    page: 'dashboard',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,0.35), rgba(139,92,246,0.35))',
    iconColor: 'text-purple-500',
  },
  {
    icon: FileText,
    label: 'Report',
    page: 'report',
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.35), rgba(6,182,212,0.35))',
    iconColor: 'text-sky-500',
  },
];

// ─── Mobile drawer ──────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  open: boolean;
  activePage: string;
  onNavigate: (page: string) => void;
  onClose: () => void;
}

function MobileDrawer({ open, activePage, onNavigate, onClose }: MobileDrawerProps) {
  const handleNav = (page: string) => {
    onNavigate(page);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Drawer panel */}
          <motion.div
            key="drawer"
            className="fixed top-[72px] left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-xl px-4 py-3"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.page === activePage;
                return (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => handleNav(item.page)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-xs font-medium transition-all',
                      isActive
                        ? 'bg-blue-50 text-blue-700 shadow-inner'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
                    )}
                    style={
                      isActive
                        ? { background: item.gradient.replace('0.35', '0.12') }
                        : undefined
                    }
                  >
                    <span className={cn('transition-colors', isActive ? item.iconColor : '')}>
                      <Icon className="h-5 w-5" />
                    </span>
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

// ─── Main TopBar export ─────────────────────────────────────────────────────────

export interface TopBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ currentPage, onNavigate }) => {
  const { companyName, reportingPeriod, boundaryApproach, saveToStorage, currentUser, logout } =
    useGHG();
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSaveAndExit = () => {
    saveToStorage();
    onNavigate('scope-hub');
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-[72px] bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-sm flex items-center">
        <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 flex items-center justify-between gap-3">

          {/* ── Left: Logo + Nav ─────────────────────────────── */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo mark */}
            <button
              type="button"
              onClick={() => onNavigate(currentUser ? 'scope-hub' : 'login')}
              className="flex-shrink-0 flex items-center gap-2 group focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md p-1"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                <span className="font-mono font-bold text-lg tracking-tighter">IV</span>
              </div>
              {/* Wordmark — hidden on very small screens */}
              <div className="hidden xs:flex flex-col text-left">
                <span className="font-mono font-bold text-sm tracking-wider text-gray-900 leading-tight">
                  INVTY
                </span>
                <span className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold">
                  GHG Portal
                </span>
              </div>
            </button>

            {/* Desktop animated nav — only when logged in */}
            {currentUser ? (
              <div className="hidden md:block">
                <AnimatedMenuBar
                  items={NAV_ITEMS}
                  activePage={currentPage}
                  onNavigate={onNavigate}
                />
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-medium">
                <Lock size={12} className="text-amber-600 flex-shrink-0" />
                <span>Sign in to access inventory</span>
              </div>
            )}
          </div>

          {/* ── Centre: Context pill (desktop only) ──────────── */}
          <div className="flex-1 hidden lg:flex justify-center pointer-events-none select-none">
            {currentUser ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3.5 py-1.5 rounded-full border border-gray-200/80 shadow-inner max-w-xs truncate">
                <span className="font-semibold text-gray-800 truncate">{companyName}</span>
                <span className="text-gray-300">·</span>
                <span className="truncate">{reportingPeriod}</span>
                <span className="text-gray-300">·</span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <CheckCircle2 size={11} className="text-emerald-500" />
                  <span className="hidden xl:inline">{boundaryApproach}</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-3.5 py-1.5 rounded-full border border-gray-200/80">
                <span className="font-semibold text-gray-700">INVTY Enterprise Portal</span>
                <span className="text-gray-300">·</span>
                <span className="font-mono">SQLite Auth Active</span>
              </div>
            )}
          </div>

          {/* ── Right: Actions & User session ────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentUser ? (
              <>
                {/* User pill */}
                <div className="flex items-center gap-2 bg-white pl-2 pr-1 py-1 rounded-full border border-gray-200 shadow-sm text-xs">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="hidden sm:flex flex-col text-left">
                    <span className="font-semibold text-gray-900 leading-tight truncate max-w-[100px]">
                      {currentUser.name}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium">
                      {currentUser.role.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign out"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-0.5"
                  >
                    <LogOut size={13} />
                  </button>
                </div>

                {/* Save draft — hidden on mobile */}
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Save size={14} />}
                  onClick={handleSaveAndExit}
                  className="hidden sm:inline-flex"
                >
                  Save
                </Button>

                {/* Settings */}
                <button
                  type="button"
                  aria-label="Settings"
                  onClick={() => onNavigate('settings')}
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600',
                    currentPage === 'settings'
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-inner'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-transparent hover:border-gray-200',
                  )}
                >
                  <Settings size={17} />
                </button>

                {/* Mobile hamburger — only when logged in */}
                <button
                  type="button"
                  aria-label="Open navigation"
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors"
                >
                  {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<LogIn size={14} />}
                onClick={() => onNavigate('login')}
                className="font-medium"
              >
                Sign In
              </Button>
            )}

            {/* Help */}
            <button
              type="button"
              aria-label="Help"
              onClick={() => setHelpOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <HelpCircle size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-down nav drawer */}
      {currentUser && (
        <MobileDrawer
          open={mobileMenuOpen}
          activePage={currentPage}
          onNavigate={onNavigate}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Help modal */}
      <Modal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="INVTY GHG Accounting Standards & Guidance"
      >
        <div className="space-y-4 text-xs text-gray-500 leading-relaxed">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
            <strong className="block font-semibold mb-1 text-blue-950">
              Regulatory Compliance Frameworks
            </strong>
            This portal executes calculations adhering strictly to the GHG Protocol Corporate
            Standard, ISO 14064-1:2018, and SEBI BRSR Core guidelines for Indian listed and
            industrial entities.
          </div>

          <div>
            <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-1.5">
              <BookOpen size={14} /> Core Methodology Rules:
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Scope 2 Dual Reporting:</strong> Location-based and market-based figures
                are tracked side-by-side and never summed into the grand total.
              </li>
              <li>
                <strong>Auto-Derived Category 3:</strong> Well-to-tank (WTT) fuels and
                transmission loss emissions are automatically derived from Scope 1 and Scope 2
                activity lines.
              </li>
              <li>
                <strong>Out-of-Scope Memos:</strong> Biogenic CO₂ and Montreal Protocol ODS
                gases (R-22) are reported separately as memo items and never added to Scope 1
                gross.
              </li>
              <li>
                <strong>Precision Arithmetic:</strong> Decimal math is enforced to prevent IEEE
                754 floating-point drift across large industrial inventories.
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
    </>
  );
};
