import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar, Play, Plus, Trash2, CalendarDays, RefreshCw,
  ChevronDown, Loader2, Zap, Clock, Globe
} from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useProject } from '@/contexts/ProjectContext';
import { useIntelRadarApi, RadarArticle, RadarSource, RadarSchedule } from '@/services/intelRadarService';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import ArticleCard from '@/components/radar/ArticleCard';
import ContentStudio from '@/components/radar/ContentStudio';

const FREQUENCIES = ['daily', 'weekly', 'bi-weekly', 'monthly'] as const;

export default function IntelRadar() {
  const { t, language } = useTranslation();
  const { activeProjectId } = useProject();
  const api = useIntelRadarApi();

  // Data state
  const [articles, setArticles] = useState<RadarArticle[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [schedule, setSchedule] = useState<RadarSchedule | null>(null);
  const [datesWithArticles, setDatesWithArticles] = useState<{ date: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const activeScanIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filters
  const [activeDate, setActiveDate] = useState<string | null>(null);

  // Studio
  const [studioArticle, setStudioArticle] = useState<RadarArticle | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  // Sources form
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [isAddingSource, setIsAddingSource] = useState(false);

  // ── Load Data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const [artData, srcData, schedData] = await Promise.all([
        api.getArticles(activeDate ? { date: activeDate } : undefined),
        api.getSources(),
        api.getSchedule(),
      ]);
      setArticles(artData.articles);
      setDatesWithArticles(artData.datesWithArticles);
      setSources(srcData);
      setSchedule(schedData);
    } catch {
      toast.error('Failed to load radar data');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, api, activeDate]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [activeProjectId, activeDate]);

  // ── Scan Polling ──────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    activeScanIdRef.current = null;
  }, []);

  const startPolling = useCallback((scanRunId: string) => {
    activeScanIdRef.current = scanRunId;
    setScanStatusMsg('Scanning industry sources…');

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await api.getScanStatus(scanRunId);
        if (status.status === 'complete') {
          stopPolling();
          setIsScanning(false);
          setScanStatusMsg('');
          toast.success(`✓ Scan complete — ${status.articles_found} new articles found`);
          loadData();
        } else if (status.status === 'failed') {
          stopPolling();
          setIsScanning(false);
          setScanStatusMsg('');
          toast.error('Scan failed: ' + (status.error || 'Unknown error'));
        }
      } catch { /* ignore transient errors */ }
    }, 5000);
  }, [api, stopPolling, loadData]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Run Now ───────────────────────────────────────────────────────────────

  const handleRunNow = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const result = await api.triggerScan();
      startPolling(result.scanRunId);
    } catch {
      setIsScanning(false);
      toast.error('Failed to start scan');
    }
  }, [api, isScanning, startPolling]);

  // ── Sources ───────────────────────────────────────────────────────────────

  const handleAddSource = useCallback(async () => {
    if (!newSourceUrl.trim()) return;
    setIsAddingSource(true);
    try {
      await api.addSource(newSourceUrl.trim());
      setNewSourceUrl('');
      toast.success('Source added');
      const updated = await api.getSources();
      setSources(updated);
    } catch {
      toast.error('Failed to add source');
    } finally {
      setIsAddingSource(false);
    }
  }, [api, newSourceUrl]);

  const handleDeleteSource = useCallback(async (id: string) => {
    try {
      await api.deleteSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
      toast.success('Source removed');
    } catch {
      toast.error('Failed to remove source');
    }
  }, [api]);

  // ── Schedule ──────────────────────────────────────────────────────────────

  const handleScheduleChange = useCallback(async (freq: string, enabled: boolean) => {
    try {
      await api.saveSchedule(freq, enabled);
      const updated = await api.getSchedule();
      setSchedule(updated);
    } catch {
      toast.error('Failed to update schedule');
    }
  }, [api]);

  // ── Studio ────────────────────────────────────────────────────────────────

  const handleSendToStudio = useCallback((article: RadarArticle) => {
    setStudioArticle(article);
    setIsStudioOpen(true);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!activeProjectId) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center">
        <Globe className="w-12 h-12 text-zinc-600" />
        <p className="text-zinc-500 text-sm">Select a project to use Intel Radar</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <Radar className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Intel Radar</h1>
              <p className="text-sm text-zinc-500">AI-powered industry intelligence</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleRunNow}
            disabled={isScanning}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
              isScanning
                ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            )}
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{scanStatusMsg || 'Scanning…'}</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Run Now
              </>
            )}
          </motion.button>
        </div>

        {/* Schedule + Sources row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Schedule Card */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Auto-Scan Schedule</span>
              {/* Enable toggle */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-zinc-500">{schedule?.is_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => schedule && handleScheduleChange(schedule.frequency, !schedule.is_enabled)}
                  className={cn(
                    'relative w-9 h-5 rounded-full transition-colors',
                    schedule?.is_enabled ? 'bg-indigo-600' : 'bg-zinc-700'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                    schedule?.is_enabled ? 'translate-x-4' : 'translate-x-0.5'
                  )} />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {FREQUENCIES.map(freq => (
                <button
                  key={freq}
                  onClick={() => handleScheduleChange(freq, schedule?.is_enabled ?? false)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize',
                    schedule?.frequency === freq
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white'
                  )}
                >
                  {freq}
                </button>
              ))}
            </div>
            {schedule?.last_run_at && (
              <p className="text-[11px] text-zinc-600">
                Last run: {new Date(schedule.last_run_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* Sources Card */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Monitored Sources</span>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={newSourceUrl}
                onChange={e => setNewSourceUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSource()}
                placeholder="https://example.com"
                className="flex-1 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-white/80 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleAddSource}
                disabled={isAddingSource || !newSourceUrl.trim()}
                className="p-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 disabled:opacity-40 transition-all"
              >
                {isAddingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {sources.map(src => (
                <div key={src.id} className="flex items-center justify-between gap-2 text-xs text-zinc-400 bg-white/[0.02] rounded-lg px-3 py-1.5">
                  <span className="truncate">{src.domain_url}</span>
                  <button onClick={() => handleDeleteSource(src.id)} className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-2">No sources added. AI will search broadly.</p>
              )}
            </div>
          </div>
        </div>

        {/* Calendar date pills */}
        {datesWithArticles.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <CalendarDays className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <button
              onClick={() => setActiveDate(null)}
              className={cn(
                'flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-all',
                !activeDate
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white'
              )}
            >
              All
            </button>
            {datesWithArticles.map(d => (
              <button
                key={d.date}
                onClick={() => setActiveDate(d.date === activeDate ? null : d.date)}
                className={cn(
                  'flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-all whitespace-nowrap',
                  activeDate === d.date
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white'
                )}
              >
                {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                <span className="ml-1.5 opacity-60">{d.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Articles grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-48 gap-3"
          >
            <Radar className="w-8 h-8 text-zinc-600" />
            <p className="text-zinc-500 text-sm">No articles yet. Click "Run Now" to scan for content.</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {articles.map((article, i) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <ArticleCard article={article} onSendToStudio={handleSendToStudio} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Content Studio panel */}
      <ContentStudio
        article={studioArticle}
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        language={language}
      />
    </>
  );
}
