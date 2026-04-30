import React, { useState, useCallback } from 'react';
import {
  X, Sparkles, Copy, RotateCcw, Check, ChevronDown, ChevronUp,
  Wand2, Image, Download, Loader2, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import type { RadarArticle, GenerateContentParams } from '@/services/intelRadarService';
import { useIntelRadarApi } from '@/services/intelRadarService';

interface Props {
  article: RadarArticle | null;
  isOpen: boolean;
  onClose: () => void;
  language: string;
}

const PLATFORMS = [
  { id: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { id: 'twitter', label: 'X / Twitter', emoji: '𝕏' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'threads', label: 'Threads', emoji: '🧵' },
  { id: 'facebook', label: 'Facebook', emoji: '👥' },
  { id: 'blog', label: 'Blog Post', emoji: '✍️' },
] as const;

const TONES = ['Professional', 'Conversational', 'Bold', 'Inspirational', 'Educational', 'Humorous'];
const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1', w: 1024, h: 1024 },
  { label: '16:9', value: '16:9', w: 1792, h: 1024 },
  { label: '9:16', value: '9:16', w: 1024, h: 1792 },
  { label: '4:5', value: '4:5', w: 1024, h: 1280 },
  { label: '5:4', value: '5:4', w: 1280, h: 1024 },
];

type PromptState = 'idle' | 'enhancing' | 'enhanced' | 'generating' | 'done';

export default function ContentStudio({ article, isOpen, onClose, language }: Props) {
  const api = useIntelRadarApi();

  // Content Studio state
  const [platform, setPlatform] = useState<GenerateContentParams['platform']>('linkedin');
  const [tone, setTone] = useState('Professional');
  const [cta, setCta] = useState('');
  const [hashtags, setHashtags] = useState(true);
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [articleExpanded, setArticleExpanded] = useState(false);

  // Visual Studio state
  const [userPrompt, setUserPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [promptState, setPromptState] = useState<PromptState>('idle');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageUrl, setImageUrl] = useState('');
  const [imageJobId, setImageJobId] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!article) return;
    setIsGenerating(true);
    setContent('');
    try {
      const result = await api.generateContent({
        articleId: article.id,
        platform,
        tone,
        language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
        cta: cta || undefined,
        hashtags,
      });
      setContent(result.content);
    } catch {
      toast.error('Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  }, [article, api, platform, tone, language, cta, hashtags]);

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleEnhance = useCallback(async () => {
    if (!userPrompt.trim()) return;
    setPromptState('enhancing');
    try {
      const r = await api.enhancePrompt(userPrompt);
      setEnhancedPrompt(r.enhanced);
      setPromptState('enhanced');
    } catch {
      toast.error('Enhancement failed');
      setPromptState('idle');
    }
  }, [api, userPrompt]);

  const handleGenerateImage = useCallback(async () => {
    const prompt = enhancedPrompt || userPrompt;
    if (!prompt.trim()) return;
    setPromptState('generating');
    try {
      const ar = ASPECT_RATIOS.find(a => a.value === aspectRatio)!;
      const r = await api.generateImage({ prompt, aspectRatio, width: ar.w, height: ar.h });
      setImageJobId(r.jobId);
      // Poll for result
      const poll = setInterval(async () => {
        try {
          const status = await api.getImageJobStatus(r.jobId);
          if (status.imageUrl) {
            setImageUrl(status.imageUrl);
            setPromptState('done');
            clearInterval(poll);
          } else if (status.status === 'failed') {
            toast.error('Image generation failed');
            setPromptState('enhanced');
            clearInterval(poll);
          }
        } catch { clearInterval(poll); setPromptState('enhanced'); }
      }, 4000);
    } catch {
      toast.error('Failed to start generation');
      setPromptState('idle');
    }
  }, [api, userPrompt, enhancedPrompt, aspectRatio]);

  const keywords: string[] = Array.isArray(article?.keywords) ? article!.keywords : [];

  return (
    <AnimatePresence>
      {isOpen && article && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-[#0f0f14] border-l border-white/[0.06] z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-sm text-white">Content Studio</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Article Context */}
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <button
                  onClick={() => setArticleExpanded(v => !v)}
                  className="w-full flex items-center justify-between text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  <span className="font-medium uppercase tracking-wider">Source Article</span>
                  {articleExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <p className="text-sm text-white/80 font-medium mt-2 line-clamp-2">{article.title}</p>
                <AnimatePresence>
                  {articleExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{article.ai_summary || article.summary}</p>
                      {keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {keywords.map(k => (
                            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300">#{k}</span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Platform Tabs */}
              <div className="px-6 py-4 border-b border-white/[0.06] space-y-4">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Platform</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id as GenerateContentParams['platform'])}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all',
                        platform === p.id
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white hover:border-white/20'
                      )}
                    >
                      <span className="text-base leading-none">{p.emoji}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tone */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Tone</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map(t => (
                      <button
                        key={t}
                        onClick={() => setTone(t)}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-lg border transition-all',
                          tone === t
                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                            : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hashtags}
                      onChange={e => setHashtags(e.target.checked)}
                      className="accent-indigo-500"
                    />
                    <span className="text-xs text-zinc-400">Include hashtags</span>
                  </label>
                </div>

                {/* CTA */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">CTA (optional)</p>
                  <input
                    type="text"
                    value={cta}
                    onChange={e => setCta(e.target.value)}
                    placeholder="e.g. Book a free demo"
                    className="w-full text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-white/80 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGenerating ? 'Generating…' : 'Generate Content'}
                </button>
              </div>

              {/* Output */}
              {(content || isGenerating) && (
                <div className="px-6 py-4 border-b border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Output</p>
                    <span className="text-[10px] text-zinc-600">{content.length} chars</span>
                  </div>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={8}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 resize-none focus:outline-none focus:border-indigo-500/40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={handleGenerate}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {/* Visual Studio */}
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-indigo-400" />
                  <p className="text-sm font-semibold text-white">Visual Studio</p>
                </div>

                {/* Prompt input */}
                {(promptState === 'idle' || promptState === 'enhancing') && (
                  <div className="space-y-3">
                    <textarea
                      value={userPrompt}
                      onChange={e => setUserPrompt(e.target.value)}
                      rows={3}
                      placeholder="Describe the image you want to create…"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-indigo-500/40"
                    />
                    <button
                      onClick={handleEnhance}
                      disabled={!userPrompt.trim() || promptState === 'enhancing'}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:text-white hover:border-indigo-500/30 disabled:opacity-40 text-sm transition-all"
                    >
                      {promptState === 'enhancing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {promptState === 'enhancing' ? 'Enhancing…' : '✦ Enhance with AI'}
                    </button>
                  </div>
                )}

                {/* Enhanced prompt review */}
                {(promptState === 'enhanced' || promptState === 'generating') && (
                  <div className="space-y-3">
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
                      <p className="text-[10px] uppercase tracking-wider text-indigo-400 mb-2">Enhanced Prompt</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{enhancedPrompt}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPromptState('idle')}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                      >
                        <ArrowLeft className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={handleEnhance}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Re-enhance
                      </button>
                    </div>
                    {/* Aspect ratio */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Aspect Ratio</p>
                      <div className="flex gap-2">
                        {ASPECT_RATIOS.map(ar => (
                          <button
                            key={ar.value}
                            onClick={() => setAspectRatio(ar.value)}
                            className={cn(
                              'flex-1 text-xs py-2 rounded-lg border transition-all',
                              aspectRatio === ar.value
                                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-white'
                            )}
                          >
                            {ar.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateImage}
                      disabled={promptState === 'generating'}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-all"
                    >
                      {promptState === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                      {promptState === 'generating' ? 'Generating…' : 'Generate Image'}
                    </button>
                  </div>
                )}

                {/* Result image */}
                {promptState === 'done' && imageUrl && (
                  <div className="space-y-3">
                    <img src={imageUrl} alt="Generated" className="w-full rounded-xl border border-white/[0.08]" />
                    <div className="flex gap-2">
                      <a
                        href={imageUrl}
                        download
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                      <button
                        onClick={() => { setPromptState('enhanced'); setImageUrl(''); }}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 hover:text-white transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Regenerate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
