import { useState, useEffect } from 'react';
import {
  BarChart2, TrendingUp, Users, Mail, MousePointer,
  MessageSquare, Globe, AlertTriangle, CheckCircle2, Shield, Loader2
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { OutreachMetricCard, OutreachBadge, OutreachSectionHeader } from './OutreachCommon';
import { cn } from '@/lib/utils';
import { useOutreachApi, AnalyticsData } from '@/hooks/useOutreachApi';

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1c2128] border border-[#30363d] rounded-xl px-4 py-3 shadow-2xl text-xs">
      <p className="font-bold text-white mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 mb-0.5" style={{ color: p.color }}>
          <span className="size-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: <span className="font-bold text-white">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function OutreachAnalytics() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchAnalytics, activeProjectId } = useOutreachApi();

  useEffect(() => {
    async function load() {
      if (!activeProjectId) return;
      setIsLoading(true);
      setError(null);
      try {
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const res = await fetchAnalytics(days);
        if (res) {
          setData(res);
        } else {
          setError('No data returned from the server.');
        }
      } catch (err: any) {
        console.error('Failed to load analytics:', err);
        setError(err.message || 'Failed to connect to the analytics service.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [timeRange, activeProjectId, fetchAnalytics]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="size-8 animate-spin mb-4 text-teal-500" />
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="size-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Analytics Unavailable</h3>
        <p className="text-slate-400 max-w-xs mb-6">
          {error || "We couldn't retrieve your analytics data. Please check your connection and try again."}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const dailyData = data?.daily_data || [];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background-dark">
      <div className="px-8 py-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
            <p className="text-sm text-slate-400 mt-0.5">Performance across all campaigns and mailboxes</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl p-1">
            {(['7d', '30d', '90d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
                  timeRange === r ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'text-slate-500 hover:text-white'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <OutreachMetricCard 
            label="Total Sent" 
            value={data.total_sent?.toLocaleString() || "0"} 
            teal 
            icon={<Mail />} 
            trend={Number(data.sent_change) >= 0 ? "up" : "down"}
            trendValue={`${Math.abs(Number(data.sent_change))}%`} 
          />
          <OutreachMetricCard 
            label="Open Rate" 
            value={`${data.open_rate}%`} 
            icon={<TrendingUp />} 
            trend="neutral" 
            trendValue="vs average" 
            sub="industry avg 21%" 
          />
          <OutreachMetricCard 
            label="Reply Rate" 
            value={`${data.reply_rate}%`} 
            icon={<MessageSquare />} 
            trend="neutral" 
            trendValue="vs average" 
          />
          <OutreachMetricCard 
            label="Daily Avg" 
            value={data.emails_sent_today?.toString() || "0"} 
            icon={<MousePointer />} 
            trend="neutral" 
            trendValue="today" 
          />
        </div>

        {/* Counts Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Active Sequences</p>
              <p className="text-xl font-bold text-white">{data.active_sequences}</p>
            </div>
            <BarChart2 className="size-5 text-teal-500/50" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Total Recipients</p>
              <p className="text-xl font-bold text-white">{data.total_recipients}</p>
            </div>
            <Users className="size-5 text-teal-500/50" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Pending Tasks</p>
              <p className="text-xl font-bold text-white">{data.pending_tasks}</p>
            </div>
            <Loader2 className="size-5 text-teal-500/50" />
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
          <OutreachSectionHeader
            icon={<BarChart2 />}
            title="Engagement Over Time"
            subtitle="Daily email volume and engagement metrics"
          />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="sent"    stroke="#475569"   strokeWidth={1.5} dot={false} name="Sent" />
              <Line type="monotone" dataKey="opens"   stroke="#14B8A6"   strokeWidth={2}   dot={false} name="Opens" />
              <Line type="monotone" dataKey="replies" stroke="#22C55E"   strokeWidth={2}   dot={false} name="Replies" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Intent Breakdown */}
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
            <OutreachSectionHeader icon={<MessageSquare />} title="Reply Intent Breakdown" subtitle="AI-categorized reply intent" />
            <div className="flex items-center gap-4">
              <PieChart width={140} height={140}>
                <Pie data={data?.intent_data || []} cx={70} cy={70} innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {(data?.intent_data || []).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-2">
                {(data?.intent_data || []).map((item) => {
                  const name = item?.name || 'Unknown';
                  const value = item?.value || 0;
                  const color = item?.color || '#333';
                  return (
                    <div key={String(name)} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-slate-400">{String(name)}</span>
                      </div>
                      <span className="font-bold text-white">{String(value)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Campaign Comparison */}
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
            <OutreachSectionHeader icon={<BarChart2 />} title="Campaign Comparison" subtitle="Open & reply rates per campaign" />
            <ResponsiveContainer width="100%" height={160}>
              {(data?.campaign_comparison || []).length > 0 ? (
                <BarChart layout="vertical" data={data?.campaign_comparison || []} margin={{ left: 0, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="open"  name="Open Rate"  fill="#14B8A6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="reply" name="Reply Rate" fill="#22C55E" radius={[0, 4, 4, 0]} />
                </BarChart>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  No campaign data found for this period.
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mailbox Health */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
          <OutreachSectionHeader
            icon={<Shield />}
            title="Mailbox Health"
            subtitle="Deliverability score per connected mailbox"
          />
          <div className="space-y-4">
            {(data?.mailbox_health || []).length > 0 ? (data?.mailbox_health || []).map(({ email, score, status, sent, bounceRate, spamRate }) => {
              const scoreColor = score >= 85 ? '#14B8A6' : score >= 70 ? '#EAB308' : '#EF4444';
              const scoreBadge = score >= 85 ? 'teal' : score >= 70 ? 'yellow' : 'red';
              return (
                <div key={String(email)} className="flex items-center gap-5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div style={{ '--score-color': scoreColor } as any} className="relative size-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5" />
                      <circle
                        cx="18" cy="18" r="15" fill="none"
                        stroke={scoreColor} strokeWidth="2.5"
                        strokeDasharray={`${(Number(score) / 100) * 94.2} 94.2`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: scoreColor }}>{String(score)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-white text-sm">{String(email)}</p>
                      <OutreachBadge variant={scoreBadge as any}>
                        {String(status)}
                      </OutreachBadge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{Number(sent).toLocaleString()} sent</span>
                      <span className={Number(bounceRate) > 3 ? 'text-red-400' : 'text-slate-400'}>Bounce: {String(bounceRate)}%</span>
                      <span className={Number(spamRate) > 0.5 ? 'text-amber-400' : 'text-slate-400'}>Spam: {String(spamRate)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    {score >= 85 && <CheckCircle2 className="size-4 text-teal-400" />}
                    {score < 85 && score >= 70 && <AlertTriangle className="size-4 text-amber-400" />}
                    {score < 70 && <AlertTriangle className="size-4 text-red-400" />}
                  </div>
                </div>
              );
            }) : (
              <div className="text-slate-500 text-sm text-center py-4">
                No mailboxes connected or active in this time period.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
