import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useSocialApi } from '@/hooks/useSocialApi';
import ComposeView from './social-studio/ComposeView';
import QueueView from './social-studio/QueueView';
import CalendarView from './social-studio/CalendarView';
import AnalyticsView from './social-studio/AnalyticsView';
import AccountsView from './social-studio/AccountsView';
import {
  PenSquare, CalendarDays, BarChart2, Link2,
  Layers, Share2, Zap
} from 'lucide-react';

const TABS = [
  { id: 'compose',  label: 'Compose',   icon: PenSquare },
  { id: 'queue',    label: 'Queue',      icon: Layers },
  { id: 'calendar', label: 'Calendar',   icon: CalendarDays },
  { id: 'analytics',label: 'Analytics',  icon: BarChart2 },
  { id: 'accounts', label: 'Accounts',   icon: Link2 },
] as const;

type Tab = (typeof TABS)[number]['id'];

export default function SocialStudioLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useSocialApi();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const activeTab = (searchParams.get('tab') as Tab) || 'compose';
  const setTab = (tab: Tab) => setSearchParams({ tab });

  const loadAccounts = useCallback(async () => {
    try {
      setLoadingAccounts(true);
      const data = await api.getAccounts();
      setAccounts(data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setLoadingAccounts(false); }
  }, [api]);

  const loadPosts = useCallback(async () => {
    try {
      setLoadingPosts(true);
      const data = await api.getPosts();
      setPosts(data || []);
    } catch (err: any) {
      console.error(err);
    } finally { setLoadingPosts(false); }
  }, [api]);

  useEffect(() => {
    loadAccounts();
    loadPosts();

    // Handle OAuth redirect back with ?connected=platform
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      toast.success(`✅ ${connected.charAt(0).toUpperCase() + connected.slice(1)} connected!`);
      setSearchParams({ tab: 'accounts' });
      loadAccounts();
    }
    if (error) {
      toast.error(`OAuth error: ${decodeURIComponent(error)}`);
      setSearchParams({ tab: 'accounts' });
    }
  }, [api.activeProjectId]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Share2 className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Social Studio</h1>
            <p className="text-xs text-slate-500 font-medium">Schedule & publish to all your social platforms</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
          <Zap className="size-3 text-violet-400" />
          <span className="text-xs text-violet-300 font-semibold">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''} connected
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-8 py-3 border-b border-white/5 shrink-0">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-violet-500/15 border border-violet-500/30 text-violet-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {activeTab === 'compose' && (
              <ComposeView
                accounts={accounts}
                loadingAccounts={loadingAccounts}
                onPostCreated={loadPosts}
                onNavigateToAccounts={() => setTab('accounts')}
              />
            )}
            {activeTab === 'queue' && (
              <QueueView
                posts={posts}
                loading={loadingPosts}
                onRefresh={loadPosts}
                api={api}
              />
            )}
            {activeTab === 'calendar' && (
              <CalendarView posts={posts} loading={loadingPosts} />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsView posts={posts} loading={loadingPosts} />
            )}
            {activeTab === 'accounts' && (
              <AccountsView
                accounts={accounts}
                loading={loadingAccounts}
                onRefresh={loadAccounts}
                api={api}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
