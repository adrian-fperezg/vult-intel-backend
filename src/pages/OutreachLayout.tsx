import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useOutreachSubscription } from '@/hooks/useOutreachSubscription';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import OutreachUpgradeScreen from './outreach/OutreachUpgradeScreen';
import OutreachLockedScreen from './outreach/OutreachLockedScreen';
import OutreachCampaigns from './outreach/OutreachCampaigns';
import OutreachSequences from './outreach/OutreachSequences';
import OutreachContacts from './outreach/OutreachContacts';
import OutreachInbox from './outreach/OutreachInbox';
import OutreachAnalytics from './outreach/OutreachAnalytics';
import OutreachLeadFinder from './outreach/OutreachLeadFinder';
import OutreachSettings from './outreach/OutreachSettings';
import OutreachCompose from './outreach/OutreachCompose';
import { PaperPlaneIcon } from './outreach/OutreachCommon';
import ErrorBoundary from '@/components/ErrorBoundary';

type OutreachTab = 'analytics' | 'lead-finder' | 'contacts' | 'compose' | 'campaigns' | 'sequences' | 'inbox' | 'settings';

const TABS: Array<{ id: OutreachTab; label: string; badge?: boolean }> = [
  { id: 'analytics',    label: 'Analytics' },
  { id: 'compose',      label: 'Compose', badge: true },
  { id: 'campaigns',    label: 'Campaigns' },
  { id: 'sequences',    label: 'Sequences' },
  { id: 'inbox',        label: 'Inbox', badge: true },
  { id: 'contacts',     label: 'Contacts' },
  { id: 'lead-finder',   label: 'Lead Finder' },
  { id: 'settings',     label: 'Settings' },
];

export default function OutreachLayout() {
  const { status, daysRemaining, isLoading } = useOutreachSubscription();
  const { fetchIndividualEmails, fetchInboxUnreadCount } = useOutreachApi();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const activeTab = (searchParams.get('tab') as OutreachTab) || 'analytics';
  const setActiveTab = (tab: OutreachTab) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      return newParams;
    }, { replace: true });
  };

  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const { activeProjectId } = useOutreachApi(); // Use project context handled by the hook or directly

  // Check URL array on mount for OAuth redirect parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected') === '1') {
      toast.success('Gmail account connected successfully!');
      setActiveTab('settings');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      toast.error(params.get('error') || 'Error connecting Gmail');
      setActiveTab('settings');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Listen for cross-tab navigation events (e.g. from Dashboard cards)
    const handleTabChange = (e: any) => {
      const target = e.detail as OutreachTab;
      if (TABS.some(t => t.id === target)) {
        setActiveTab(target);
      }
    };

    window.addEventListener('outreach-tab-change', handleTabChange);
    return () => window.removeEventListener('outreach-tab-change', handleTabChange);
  }, [setSearchParams]);


  // Poll for draft and unread inbox counts
  useEffect(() => {
    if (status === 'inactive' || status === 'expired' || status === 'cancelled' || !activeProjectId) return;
  
    let isMounted = true;
    const loadCounts = async () => {
      try {
        const [draftData, unreadCount] = await Promise.all([
          fetchIndividualEmails('draft'),
          fetchInboxUnreadCount(activeProjectId)
        ]);
        if (isMounted) {
          if (draftData) setDraftCount(draftData.length);
          setUnreadInboxCount(unreadCount);
        }
      } catch (error) {
        console.error('[OutreachLayout Polling Error]:', error);
      }
    };
  
    loadCounts();
    const interval = setInterval(loadCounts, 15000); // Check every 15s

    // Listen for manual refresh requests (e.g. from children marking messages as read)
    const handleManualRefresh = () => loadCounts();
    window.addEventListener('refresh-outreach-counts', handleManualRefresh);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('refresh-outreach-counts', handleManualRefresh);
    }
  }, [fetchIndividualEmails, fetchInboxUnreadCount, status, activeProjectId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="size-5 animate-spin text-teal-400" />
        <span className="text-sm font-medium">Checking Outreach subscription…</span>
      </div>
    );
  }

  // ── Paywall Gate Screens ──────────────────────────────────────────────────
  if (status === 'inactive') {
    return <OutreachUpgradeScreen />;
  }

  if (status === 'expired' || status === 'cancelled') {
    return <OutreachLockedScreen />;
  }

  // ── Full Module (active | trial) ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Module Header */}
      <div className="shrink-0 border-b border-white/5 bg-[#0d1117]">
        {/* Trial Banner */}
        <AnimatePresence>
          {status === 'trial' && !trialBannerDismissed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between gap-4 px-8 py-2.5 bg-teal-500/10 border-b border-teal-500/20">
                <div className="flex items-center gap-3 text-sm">
                  <PaperPlaneIcon className="size-4 text-teal-400 shrink-0" />
                  <span className="text-teal-300 font-medium">
                    Free trial — <span className="font-bold text-teal-200">{daysRemaining} days remaining</span>
                  </span>
                  <button className="text-teal-400 underline hover:text-teal-200 font-semibold transition-colors text-xs">
                    Upgrade now
                  </button>
                </div>
                <button
                  onClick={() => setTrialBannerDismissed(true)}
                  className="text-teal-400/60 hover:text-teal-300 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Module Title + Tab Bar */}
        <div className="px-8 pt-6 pb-0">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
              <PaperPlaneIcon className="size-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Outreach</h1>
              <p className="text-[11px] text-teal-400/60 font-semibold uppercase tracking-widest">Sales Automation Module</p>
            </div>
            {status === 'trial' && (
              <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-purple-500/15 border border-purple-500/20 text-purple-400">
                Trial
              </span>
            )}
          </div>

          {/* Horizontal Tab Bar */}
          <nav className="flex items-center gap-0" role="tablist">
            {TABS.map(({ id, label, badge }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'relative px-5 pb-3.5 pt-1 text-sm font-semibold transition-colors flex items-center gap-2',
                    isActive ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  {label}
                  {badge && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                      isActive ? "bg-teal-500/20 text-teal-300" : "bg-white/10 text-slate-400",
                      id === 'compose' && draftCount === 0 && "hidden",
                      id === 'inbox' && unreadInboxCount === 0 && "hidden"
                    )}>
                      {id === 'compose' ? draftCount : unreadInboxCount}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="outreach-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="h-full"
          >
            <ErrorBoundary name={`Outreach:${activeTab}`}>
              {activeTab === 'analytics'    && <OutreachAnalytics />}
              {activeTab === 'lead-finder'  && <OutreachLeadFinder />}
              {activeTab === 'contacts'     && <OutreachContacts />}
              {activeTab === 'compose'      && <OutreachCompose />}
              {activeTab === 'campaigns'    && <OutreachCampaigns />}
              {activeTab === 'sequences'    && <OutreachSequences />}
              {activeTab === 'inbox'        && <OutreachInbox />}
              {activeTab === 'settings'     && <OutreachSettings />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
