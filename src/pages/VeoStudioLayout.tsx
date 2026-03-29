import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Clapperboard, Film, Library, BookOpen, Palette, Settings, Sparkles, FolderSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVeoStudioSubscription } from '@/hooks/useVeoStudioSubscription';
import { useProject } from '@/contexts/ProjectContext';
import VeoStudioUpgradeScreen from './veo-studio/VeoStudioUpgradeScreen';
import VeoStudioCreate from './veo-studio/VeoStudioCreate';
import VeoStudioLibrary from './veo-studio/VeoStudioLibrary';
import VeoStudioStoryboard from './veo-studio/VeoStudioStoryboard';
import VeoStudioBrandKit from './veo-studio/VeoStudioBrandKit';
import VeoStudioSettings from './veo-studio/VeoStudioSettings';
import ErrorBoundary from '@/components/ErrorBoundary';

type VeoTab = 'create' | 'library' | 'storyboard' | 'brand-kit' | 'settings';

const TABS: Array<{ id: VeoTab; label: string; icon: React.ElementType }> = [
  { id: 'create',     label: 'Create',     icon: Film },
  { id: 'library',    label: 'Library',    icon: Library },
  { id: 'storyboard', label: 'Storyboard', icon: BookOpen },
  { id: 'brand-kit',  label: 'Brand Kit',  icon: Palette },
  { id: 'settings',   label: 'Settings',   icon: Settings },
];

export default function VeoStudioLayout() {
  const { status, videosUsed, videosLimit, isLoading } = useVeoStudioSubscription();
  const { activeProjectId, isLoading: projectsLoading } = useProject();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = (searchParams.get('tab') as VeoTab) || 'create';
  const setActiveTab = (tab: VeoTab) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('tab', tab);
      return p;
    }, { replace: true });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading || projectsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="size-5 animate-spin text-amber-400" />
        <span className="text-sm font-medium">Loading Veo Studio…</span>
      </div>
    );
  }

  // ── Paywall ──────────────────────────────────────────────────────────────────
  if (status === 'inactive' || status === 'expired' || status === 'cancelled') {
    return <VeoStudioUpgradeScreen />;
  }

  // ── No Project ───────────────────────────────────────────────────────────────
  if (!activeProjectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0d1117]">
        <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 mb-6">
          <FolderSearch className="size-10 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Project Selected</h2>
        <p className="text-slate-400 max-w-md mb-8">
          Veo Studio requires an active project to organize your cinematic assets and brand kits. 
          Please select a project from the sidebar to continue.
        </p>
      </div>
    );
  }

  // ── Full Studio ──────────────────────────────────────────────────────────────
  const isUnlimited = videosLimit >= 9999;
  const usagePct = isUnlimited ? 0 : Math.min((videosUsed / videosLimit) * 100, 100);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Module Header */}
      <div className="shrink-0 border-b border-white/5 bg-[#0d1117]">
        {/* Title row */}
        <div className="px-8 pt-6 pb-0">
          <div className="flex items-center gap-3 mb-5">
            {/* Icon */}
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)] relative">
              <Clapperboard className="size-5 text-amber-400" strokeWidth={1.75} />
              <div className="absolute inset-0 rounded-xl bg-amber-500/5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Veo Studio</h1>
              <p className="text-[11px] text-amber-400/60 font-semibold uppercase tracking-widest">
                AI Cinematic Generation
              </p>
            </div>

            {/* Usage pill */}
            <div className="ml-auto flex items-center gap-3">
              {!isUnlimited && (
                <div className="flex items-center gap-2.5">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[11px] text-amber-400/70 font-bold tabular-nums">
                      {videosUsed} / {videosLimit} videos
                    </span>
                    <div className="w-28 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${usagePct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={cn(
                          'h-full rounded-full',
                          usagePct >= 90 ? 'bg-red-500' : usagePct >= 75 ? 'bg-orange-400' : 'bg-amber-400'
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
              {isUnlimited && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <Sparkles className="size-3 text-amber-400" />
                  <span className="text-[11px] text-amber-400 font-black">∞ Unlimited</span>
                </div>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <nav className="flex items-center gap-0" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'relative px-5 pb-3.5 pt-1 text-sm font-semibold transition-colors flex items-center gap-2',
                    isActive ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                  {isActive && (
                    <motion.div
                      layoutId="veo-studio-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeProjectId}-${activeTab}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="h-full"
          >
            <ErrorBoundary name={`VeoStudio:${activeTab}`}>
              {activeTab === 'create'     && <VeoStudioCreate projectId={activeProjectId} />}
              {activeTab === 'library'    && <VeoStudioLibrary projectId={activeProjectId} />}
              {activeTab === 'storyboard' && <VeoStudioStoryboard projectId={activeProjectId} />}
              {activeTab === 'brand-kit'  && <VeoStudioBrandKit projectId={activeProjectId} />}
              {activeTab === 'settings'   && <VeoStudioSettings projectId={activeProjectId} />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
