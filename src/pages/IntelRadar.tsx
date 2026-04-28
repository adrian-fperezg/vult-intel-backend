import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Calendar, 
  Globe, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Share2, 
  Image as ImageIcon,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/contexts/TranslationContext';
import { useIntelRadarApi, RadarSource, RadarArticle } from '@/services/intelRadarService';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

export default function IntelRadar() {
  const { t } = useTranslation();
  const api = useIntelRadarApi();
  
  const [isRunning, setIsRunning] = useState(false);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [articles, setArticles] = useState<RadarArticle[]>([]);
  const [frequency, setFrequency] = useState('weekly');
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [generatingPostId, setGeneratingPostId] = useState<string | null>(null);
  const [generatingThumbnailId, setGeneratingThumbnailId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sourcesData, articlesData] = await Promise.all([
        api.getSources(),
        api.getArticles()
      ]);
      setSources(sourcesData || []);
      setArticles(articlesData || []);
    } catch (error) {
      console.error('Failed to load radar data:', error);
      toast.error('Failed to load radar data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunRadar = async () => {
    setIsRunning(true);
    try {
      await api.runRadar();
      toast.success('Radar execution started successfully');
      // Refresh articles after a delay or poll
      setTimeout(loadData, 5000);
    } catch (error) {
      toast.error('Failed to execute radar');
    } finally {
      setIsRunning(false);
    }
  };

  const handleAddSource = async () => {
    if (!newUrl) return;
    try {
      await api.addSource(newUrl);
      setNewUrl('');
      loadData();
      toast.success('Source added successfully');
    } catch (error) {
      toast.error('Failed to add source');
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await api.deleteSource(id);
      loadData();
      toast.success('Source removed');
    } catch (error) {
      toast.error('Failed to remove source');
    }
  };

  const handleUpdateSchedule = async (freq: string) => {
    try {
      await api.updateSchedule(freq);
      setFrequency(freq);
      toast.success(`Schedule updated to ${freq}`);
    } catch (error) {
      toast.error('Failed to update schedule');
    }
  };

  const handleGeneratePost = async (articleId: string) => {
    setGeneratingPostId(articleId);
    try {
      await api.generateSocialPost(articleId);
      loadData();
      toast.success('Social post drafted');
    } catch (error) {
      toast.error('Failed to generate post');
    } finally {
      setGeneratingPostId(null);
    }
  };

  const handleGenerateThumbnail = async (articleId: string, title: string) => {
    setGeneratingThumbnailId(articleId);
    try {
      const data = await api.generateThumbnail(articleId, title);
      if (data.imageUrl) {
        toast.success('Thumbnail generated! Check Veo Studio library.');
        // Optionally refresh if we had article thumbnails in state
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      toast.error('Failed to generate thumbnail');
    } finally {
      setGeneratingThumbnailId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="size-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header section */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-surface-dark/40 border border-white/5 p-8 rounded-3xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 size-64 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 size-64 bg-purple-500/10 rounded-full blur-[100px]" />
        
        <div className="space-y-2 relative z-10">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60"
          >
            {t('radar.title')}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-400 text-lg"
          >
            {t('radar.subtitle')}
          </motion.p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRunRadar}
          disabled={isRunning}
          className={cn(
            "relative z-10 flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all duration-300",
            isRunning 
              ? "bg-primary/20 text-primary cursor-not-allowed border border-primary/30" 
              : "bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]"
          )}
        >
          {isRunning ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
          {isRunning ? t('radar.running') : t('radar.runNow')}
        </motion.button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Column */}
        <div className="space-y-8">
          {/* Scheduling Card */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface-dark/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl space-y-6"
          >
            <div className="flex items-center gap-3 text-white">
              <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Calendar className="size-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold">{t('radar.schedule.title')}</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {['daily', 'weekly', 'biweekly', 'monthly'].map((freq) => (
                <button
                  key={freq}
                  onClick={() => handleUpdateSchedule(freq)}
                  className={cn(
                    "px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200",
                    frequency === freq 
                      ? "bg-primary/10 border-primary/40 text-white" 
                      : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                  )}
                >
                  {t(`radar.schedule.${freq}`)}
                </button>
              ))}
            </div>
          </motion.section>

          {/* Sources Card */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface-dark/40 border border-white/5 rounded-3xl p-6 backdrop-blur-xl space-y-6"
          >
            <div className="flex items-center gap-3 text-white">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Globe className="size-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold">{t('radar.sources.title')}</h2>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={t('radar.sources.placeholder')}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button 
                onClick={handleAddSource}
                className="p-3 bg-primary rounded-xl text-white hover:opacity-90 transition-opacity"
              >
                <Plus className="size-5" />
              </button>
            </div>

            <div className="space-y-3">
              {sources.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 group">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-white truncate">{source.domain}</span>
                    <span className={cn(
                      "text-[10px] uppercase font-bold tracking-wider",
                      source.reputation === 'high' ? 'text-emerald-400' : 'text-amber-400'
                    )}>
                      {source.reputation} {t('radar.sources.reputation')}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleDeleteSource(source.id)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* Intelligence Grid */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white px-2">{t('radar.articles.title')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {articles.length > 0 ? (
                articles.map((article, idx) => (
                  <motion.article
                    key={article.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative bg-surface-dark/40 border border-white/5 rounded-3xl overflow-hidden hover:border-primary/30 transition-all duration-300 flex flex-col"
                  >
                    <div className="p-6 space-y-4 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {article.source}
                        </span>
                        <a 
                          href={article.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-white transition-colors"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </div>
                      
                      <h3 className="text-lg font-bold text-white leading-tight group-hover:text-primary transition-colors">
                        {article.title}
                      </h3>
                      
                      <p className="text-sm text-slate-400 line-clamp-3">
                        {article.summary}
                      </p>

                      {article.socialPostDraft && (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                            <Share2 className="size-3" /> Social Draft
                          </p>
                          <p className="text-sm text-slate-300 italic">"{article.socialPostDraft}"</p>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t border-white/5 bg-white/[0.02] flex items-center gap-2">
                      <button 
                        onClick={() => handleGeneratePost(article.id)}
                        disabled={generatingPostId === article.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all"
                      >
                        {generatingPostId === article.id ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                        {t('radar.articles.draftPost')}
                      </button>
                      <button 
                        onClick={() => handleGenerateThumbnail(article.id, article.title)}
                        disabled={generatingThumbnailId === article.id}
                        className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all border border-primary/20 disabled:opacity-50"
                        title="Generate Thumbnail with Veo Studio"
                      >
                        {generatingThumbnailId === article.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ImageIcon className="size-4" />
                        )}
                      </button>
                    </div>
                  </motion.article>
                ))
              ) : (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="size-16 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                    <Radio className="size-8 text-slate-600" />
                  </div>
                  <p className="text-slate-500 max-w-xs mx-auto">
                    {t('radar.articles.noArticles')}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
