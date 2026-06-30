import { useMemo } from 'react';
import { BarChart2, TrendingUp, CheckCircle2, AlertCircle, Clock, FileEdit } from 'lucide-react';

interface AnalyticsViewProps {
  posts: any[];
  loading: boolean;
}

export default function AnalyticsView({ posts, loading }: AnalyticsViewProps) {
  const stats = useMemo(() => {
    const total = posts.length;
    const published = posts.filter(p => p.status === 'published').length;
    const scheduled = posts.filter(p => p.status === 'scheduled').length;
    const failed = posts.filter(p => p.status === 'failed').length;
    const drafts = posts.filter(p => p.status === 'draft').length;
    const successRate = published + failed > 0 ? Math.round((published / (published + failed)) * 100) : 0;

    // Platform breakdown from targets
    const byPlatform: Record<string, { total: number; published: number }> = {};
    posts.forEach(post => {
      const targets = typeof post.targets === 'string' ? JSON.parse(post.targets) : (post.targets || []);
      targets.forEach((t: any) => {
        if (!byPlatform[t.platform]) byPlatform[t.platform] = { total: 0, published: 0 };
        byPlatform[t.platform].total++;
        if (t.status === 'published') byPlatform[t.platform].published++;
      });
    });

    return { total, published, scheduled, failed, drafts, successRate, byPlatform };
  }, [posts]);

  const statCards = [
    { label: 'Total Posts', value: stats.total, icon: BarChart2, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Published', value: stats.published, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Drafts', value: stats.drafts, icon: FileEdit, color: 'text-slate-400', bg: 'bg-slate-500/10' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: TrendingUp, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  ];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {statCards.map(card => (
            <div key={card.label} className="rounded-2xl bg-[#161b22] border border-white/5 p-5">
              <div className={`size-9 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                <card.icon className={`size-4 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Platform breakdown */}
        {Object.keys(stats.byPlatform).length > 0 && (
          <div className="rounded-2xl bg-[#161b22] border border-white/5 p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">By Platform</h3>
            <div className="space-y-4">
              {Object.entries(stats.byPlatform).map(([platform, data]) => {
                const pct = data.total > 0 ? Math.round((data.published / data.total) * 100) : 0;
                return (
                  <div key={platform}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-300 capitalize">{platform}</span>
                      <span className="text-xs text-slate-500">{data.published}/{data.total} published</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart2 className="size-12 text-slate-700 mb-4" />
            <p className="text-slate-500 text-sm">No data yet. Start publishing to see analytics.</p>
          </div>
        )}
      </div>
    </div>
  );
}
