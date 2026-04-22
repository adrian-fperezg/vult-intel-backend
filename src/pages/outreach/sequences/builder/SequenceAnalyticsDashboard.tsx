import React, { useState, useEffect } from 'react';
import {
  BarChart2, Mail, MessageSquare, MousePointer,
  TrendingUp, Users, Loader2, AlertTriangle,
  CheckCircle2, Clock
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { OutreachMetricCard, OutreachSectionHeader, OutreachBadge } from '../../OutreachCommon';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface SequenceStats {
  id: string;
  name: string;
  totalSent: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  bounceRate: number;
  uniqueOpens: number;
  uniqueReplies: number;
  uniqueClicks: number;
  uniqueBounces: number;
  grouping: 'day' | 'week' | 'month';
  enrollmentStats: {
    total: number;
    active: number;
    completed: number;
  };
  dailyStats: {
    day: string;
    sent: number;
    opens: number;
    replies: number;
    clicks: number;
    bounced: number;
  }[];
}

interface Props {
  sequenceId: string;
}

const CUSTOM_TOOLTIP = ({ active, payload, label, t }: any) => {
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

export default function SequenceAnalyticsDashboard({ sequenceId }: Props) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<SequenceStats | null>(null);
  const [timeframe, setTimeframe] = useState<string>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchSequenceStats } = useOutreachApi();

  useEffect(() => {
    async function loadStats() {
      if (!sequenceId) return;
      setIsLoading(true);
      setError(null);
      try {
        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data = await fetchSequenceStats(sequenceId, timeframe, userTz);
        if (data) {
          setStats(data);
        } else {
          setError(t('outreach.sequences.analyticsDashboard.unavailableDesc'));
        }
      } catch (err: any) {
        console.error('Error fetching sequence stats:', err);
        setError(err.message || t('outreach.sequences.analyticsDashboard.unavailableDesc'));
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, [sequenceId, fetchSequenceStats, timeframe, t]);

  if (isLoading) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="size-8 animate-spin mb-4 text-teal-500" />
        <p className="text-sm font-medium">{t('outreach.sequences.analyticsDashboard.crunching')}</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/[0.02] border border-white/5 rounded-3xl">
        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="size-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{t('outreach.sequences.analyticsDashboard.unavailableTitle')}</h3>
        <p className="text-slate-400 max-w-xs mb-6 text-sm">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
        >
          {t('outreach.sequences.analyticsDashboard.tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Timeframe Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{t('outreach.sequences.analyticsDashboard.performanceOverview')}</h2>
          <p className="text-sm text-slate-500">{t('outreach.sequences.analyticsDashboard.metricsSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
          {[
            { label: t('outreach.analytics.timeRangeShort.1d'), value: '1d' },
            { label: t('outreach.analytics.timeRangeShort.7d'), value: '7d' },
            { label: t('outreach.analytics.timeRangeShort.30d'), value: '30d' },
            { label: t('outreach.analytics.timeRangeShort.Q1'), value: 'Q1' },
            { label: t('outreach.analytics.timeRangeShort.1y'), value: '1y' }
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeframe(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                timeframe === opt.value ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {opt.label}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <select
             value={timeframe}
             onChange={(e) => setTimeframe(e.target.value)}
             className="bg-transparent text-xs font-bold text-slate-400 outline-none pr-2 cursor-pointer hover:text-white transition-colors"
          >
            <option value="1d" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.1d')}</option>
            <option value="3d" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.3d')}</option>
            <option value="7d" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.7d')}</option>
            <option value="14d" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.14d')}</option>
            <option value="30d" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.30d')}</option>
            <option value="1m" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.1m')}</option>
            <option value="Q1" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.Q1')}</option>
            <option value="Q2" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.Q2')}</option>
            <option value="Q3" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.Q3')}</option>
            <option value="Q4" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.Q4')}</option>
            <option value="1y" className="bg-[#1c2128]">{t('outreach.analytics.timeRange.1y')}</option>
          </select>
        </div>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OutreachMetricCard
          label={t('outreach.sequences.analyticsDashboard.sentLabel')}
          value={(stats?.totalSent ?? 0).toLocaleString()}
          teal
          icon={<Mail className="size-4" />}
          sub={t('outreach.sequences.analyticsDashboard.sentSub')}
        />
        <OutreachMetricCard
          label={t('outreach.sequences.analyticsDashboard.openLabel')}
          value={`${stats?.openRate ?? 0}%`}
          icon={<TrendingUp className="size-4" />}
          sub={t('outreach.sequences.analyticsDashboard.openSub')}
        />
        <OutreachMetricCard
          label={t('outreach.sequences.analyticsDashboard.replyLabel')}
          value={`${stats?.replyRate ?? 0}%`}
          icon={<MessageSquare className="size-4" />}
          sub={t('outreach.sequences.analyticsDashboard.replySub')}
        />
        <OutreachMetricCard
          label={t('outreach.sequences.analyticsDashboard.bounceLabel')}
          value={`${stats?.bounceRate ?? 0}%`}
          icon={<AlertTriangle className="size-4" />}
          sub={t('outreach.sequences.analyticsDashboard.bounceSub')}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engagement Chart */}
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/8 rounded-3xl p-6">
          <OutreachSectionHeader
            icon={<BarChart2 />}
            title={t('outreach.sequences.analyticsDashboard.engagementTitle')}
            subtitle={t('outreach.sequences.analyticsDashboard.groupingSubtitle', { 
              grouping: t(`outreach.sequences.analyticsDashboard.grouping.${stats.grouping || 'day'}`) 
            })}
          />
          <div className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={100}>
              <LineChart data={stats.dailyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                  tickFormatter={(val) => {
                    if (!val) return '';
                    const date = new Date(val);
                    if (stats.grouping === 'month') return date.toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
                    if (stats.grouping === 'week') return `${t('outreach.sequences.analyticsDashboard.weekPrefix')} ${date.getDate()}/${date.getMonth() + 1}`;
                    return date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={(props) => <CUSTOM_TOOLTIP {...props} t={t} />} />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 20 }}
                  iconType="circle"
                />
                <Line type="monotone" dataKey="sent" stroke="#475569" strokeWidth={2} dot={false} name={t('outreach.sequences.analyticsDashboard.legendSent')} />
                <Line type="monotone" dataKey="opens" stroke="#14B8A6" strokeWidth={2.5} dot={{ r: 3, fill: '#14B8A6' }} name={t('outreach.sequences.analyticsDashboard.legendOpens')} />
                <Line type="monotone" dataKey="replies" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3, fill: '#22C55E' }} name={t('outreach.sequences.analyticsDashboard.legendReplies')} />
                <Line type="monotone" dataKey="bounced" stroke="#EF4444" strokeWidth={2.5} dot={false} name={t('outreach.sequences.analyticsDashboard.legendBounces')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrollment Status */}
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6 h-full">
            <OutreachSectionHeader
              icon={<Users />}
              title={t('outreach.sequences.analyticsDashboard.enrollmentTitle')}
              subtitle={t('outreach.sequences.analyticsDashboard.enrollmentSubtitle')}
            />

            <div className="space-y-6 mt-8">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('outreach.sequences.analyticsDashboard.active')}</p>
                    <p className="text-lg font-bold text-white">{(stats?.enrollmentStats?.active ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <OutreachBadge variant="teal" dot>{t('outreach.sequences.analyticsDashboard.inProgress')}</OutreachBadge>
              </div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('outreach.sequences.analyticsDashboard.completed')}</p>
                    <p className="text-lg font-bold text-white">{(stats?.enrollmentStats?.completed ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <OutreachBadge variant="blue">{t('outreach.sequences.analyticsDashboard.finished')}</OutreachBadge>
              </div>

              <div className="pt-6 border-t border-white/5 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-400">{t('outreach.sequences.analyticsDashboard.totalEnrolled')}</span>
                  </div>
                  <span className="text-xl font-black text-white">{(stats?.enrollmentStats?.total ?? 0).toLocaleString()}</span>
                </div>
                {/* Simple progress bar */}
                <div className="h-1.5 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-1000"
                    style={{ width: `${((stats?.enrollmentStats?.completed ?? 0) / (stats?.enrollmentStats?.total || 1)) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">
                  {t('outreach.sequences.analyticsDashboard.completionRate', { percent: Math.round(((stats?.enrollmentStats?.completed ?? 0) / (stats?.enrollmentStats?.total || 1)) * 100) })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
