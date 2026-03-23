import {
  Activity,
  Search,
  Palette,
  Cpu,
  LayoutGrid,
  Share2,
  Mail,
  Zap,
  Settings,
  LogOut,
  LogIn,
  Compass,
  Menu,
  X,
  ChevronRight,
  Briefcase,
  UserCircle,
  Target
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useUserMetrics } from '@/hooks/useUserMetrics';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AuthModal from './AuthModal';
import Logo from './Logo';
import { formatTokens } from '@/utils/formatters';

const navItems = [
  { icon: Activity, key: 'navProjectsHub', path: '/projects-hub' },
  { icon: Search, key: 'navFullScanReport', path: '/deep-scan' },
  { icon: Palette, key: 'navContentGenerator', path: '/content-generator' },
  { icon: Cpu, key: 'navWebGrowthPlan', path: '/web-growth-plan' },
  { icon: Compass, key: 'navGlobalBrandStrategy', path: '/global-brand-strategy' },
  { icon: UserCircle, key: 'navPersonaStudio', path: '/persona-studio' },
  { icon: Target, key: 'Growth Mastermind', path: '/growth-mastermind' },
  { icon: Briefcase, key: 'navCampaignArchitect', path: '/campaign-architect' },
  { icon: LayoutGrid, key: 'navVisualWorkflows', path: '/visual-workflows' },
  { icon: null, key: 'Outreach', path: '/outreach', teal: true },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, isFounder, logout } = useAuth();
  const { t, theme } = useSettings();
  const { totalLimits, metrics } = useUserMetrics();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isUnlimited = isFounder;
  const TOKEN_MAX = totalLimits.tokens || 500000;
  const totalTokensUsed = metrics.tokensUsed || 0;
  const tokenPct = isUnlimited ? 0 : (TOKEN_MAX > 0 ? Math.min((totalTokensUsed / TOKEN_MAX) * 100, 100) : 0);
  const isNearing = !isUnlimited && tokenPct >= 80;
  const barColor = isUnlimited ? 'bg-gradient-to-r from-amber-400 to-orange-500' : (isNearing ? 'bg-amber-400' : 'bg-blue-500');
  const textColor = isUnlimited ? 'text-amber-400' : (isNearing ? 'text-amber-400' : 'text-slate-400');

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  const SidebarContent = () => (
    <>
      <div className="flex flex-col gap-6 p-5 md:p-6">
        <div className="flex items-center justify-between px-1">
          <Link to="/projects-hub" className="hover:opacity-80 transition-opacity">
            <Logo className="h-[4.2rem] md:h-[4.9rem]" dark={theme === 'dark'} />
          </Link>
          {/* Close button — mobile only */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 mt-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const isTeal = (item as any).teal;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                  isActive
                    ? isTeal
                      ? "bg-teal-500/10 border border-teal-500/20 text-white"
                      : "bg-primary/10 border border-primary/20 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                {isTeal ? (
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                    className={cn(
                      "size-4 md:size-5 transition-colors shrink-0",
                      isActive ? "text-teal-400" : "text-slate-500 group-hover:text-teal-400"
                    )}
                    aria-hidden="true"
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                  </svg>
                ) : (
                  <item.icon
                    className={cn(
                      "size-4 md:size-5 transition-colors shrink-0",
                      isActive ? "text-primary" : "text-slate-500 group-hover:text-white"
                    )}
                  />
                )}
                <span className={cn("text-[15px] font-medium truncate", isActive && "font-semibold")}>
                  {isTeal ? 'Outreach' : t(item.key)}
                </span>
                {isActive && (
                  <ChevronRight className={cn("size-3 ml-auto shrink-0", isTeal ? "text-teal-400/60" : "text-primary/60")} />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom user area */}
      <div className="p-4 md:p-6 border-t border-surface-border space-y-5 mt-auto bg-surface-dark/30 backdrop-blur-sm">
        {currentUser && (
          <div className="space-y-2.5 px-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className={cn('text-xs font-bold tabular-nums tracking-tight', textColor)}>
                  {isUnlimited ? `${formatTokens(totalTokensUsed)} / ∞` : `${formatTokens(totalTokensUsed)} / ${formatTokens(TOKEN_MAX)}`}
                </span>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{t('aiTokensUsedThisMonth')}</p>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/5">
                <Zap className={cn("size-2.5", isUnlimited ? "text-amber-400" : "text-blue-400")} />
                <span className="text-[11px] text-slate-400 font-bold">
                  {isUnlimited ? '∞' : `${Math.round(tokenPct)}%`}
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden shadow-inner font-bold">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${tokenPct}%` }}
                className={cn('h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,0,0,0.5)]', barColor)}
              />
            </div>
          </div>
        )}
        {currentUser ? (
          <div className="flex flex-col gap-2">
            <Link
              to="/settings"
              className="flex items-center gap-3 p-2 rounded-xl transition-colors hover:bg-white/5 cursor-pointer border border-transparent hover:border-surface-border"
            >
              <div className="relative shrink-0">
                <img
                  alt="User profile"
                  className="size-9 md:size-10 rounded-full object-cover border border-surface-border"
                  src={currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.email || 'User'}&background=random`}
                />
                <div className="absolute bottom-0 right-0 size-2.5 bg-green-500 border-2 border-surface-dark rounded-full" />
              </div>
              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                <p className="text-[15px] font-medium text-white truncate">{currentUser.displayName || currentUser.email?.split('@')[0]}</p>
                <p className="text-sm text-slate-400 truncate">{currentUser.email}</p>
              </div>
            </Link>
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-[15px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="size-4" />
              {t('signOut')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-xl transition-colors font-medium text-[15px]"
          >
            <LogIn className="size-4" />
            {t('signInToVultIntel')}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ── MOBILE HAMBURGER BUTTON (top-left, visible on <lg) ── */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl bg-surface-dark border border-surface-border text-slate-300 hover:text-white shadow-lg backdrop-blur-sm"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* ── MOBILE OVERLAY BACKDROP ── */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER (slide in from left) ── */}
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 h-full w-[280px] z-50 flex flex-col justify-between",
          theme === 'dark' ? "bg-[#171b23]" : "bg-[#ffffff]",
          "border-r border-surface-border shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* ── DESKTOP SIDEBAR (fixed, always visible on lg+) ── */}
      <aside className={cn(
        "hidden lg:flex w-[260px] xl:w-[280px] h-screen flex-shrink-0 flex-col justify-between border-r border-surface-border z-20 fixed left-0 top-0",
        theme === 'dark' ? "bg-[#171b23]" : "bg-[#ffffff]"
      )}>
        <SidebarContent />
      </aside>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}
