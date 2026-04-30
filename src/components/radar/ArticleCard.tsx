import React from 'react';
import { ExternalLink, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RadarArticle } from '@/services/intelRadarService';

interface ArticleCardProps {
  article: RadarArticle;
  onSendToStudio: (article: RadarArticle) => void;
}

const reputationConfig = {
  high: { label: 'Trusted', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  medium: { label: 'Standard', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  low: { label: 'Community', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] text-zinc-500 tabular-nums w-8 text-right">{pct}</span>
    </div>
  );
}

export default function ArticleCard({ article, onSendToStudio }: ArticleCardProps) {
  const domain = article.source_domain || new URL(article.url).hostname.replace('www.', '');
  const rep = reputationConfig[article.source_reputation || 'medium'];
  const keywords: string[] = Array.isArray(article.keywords) ? article.keywords : [];
  const pubDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="group relative bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all duration-200">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
            alt=""
            className="w-4 h-4 rounded-sm flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-[11px] text-zinc-500 truncate">{domain}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0', rep.cls)}>
            {rep.label}
          </span>
        </div>
        {pubDate && <span className="text-[11px] text-zinc-600 flex-shrink-0">{pubDate}</span>}
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold text-white/90 leading-snug hover:text-indigo-300 transition-colors line-clamp-2 group/link"
      >
        {article.title}
        <ExternalLink className="inline-block ml-1 w-3 h-3 opacity-0 group-hover/link:opacity-60 transition-opacity" />
      </a>

      {/* AI Summary */}
      {(article.ai_summary || article.summary) && (
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
          {article.ai_summary || article.summary}
        </p>
      )}

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.slice(0, 4).map(kw => (
            <span key={kw} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              #{kw}
            </span>
          ))}
        </div>
      )}

      {/* Relevance bar */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Relevance</span>
        </div>
        <RelevanceBar score={article.relevance_score || 50} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
        >
          Read article →
        </a>
        <div className="flex-1" />
        <button
          onClick={() => onSendToStudio(article)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all"
        >
          <Sparkles className="w-3 h-3" />
          Send to Studio
        </button>
      </div>
    </div>
  );
}
