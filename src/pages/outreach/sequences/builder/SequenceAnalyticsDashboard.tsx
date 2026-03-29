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

interface SequenceStats {
  id: string;
  name: string;
  totalSent: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  enrollmentStats: {
    active: number;
    completed: number;
    total: number;
  };
  dailyStats: {
    day: string;
    sent: number;
    opens: number;
    replies: number;
    clicks: number;
  }[];
}

interface Props {
  sequenceId: string;
}

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

export default function SequenceAnalyticsDashboard({ sequenceId }: Props) {
  const [stats, setStats] = useState<SequenceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { fetchSequenceStats } = useOutreachApi();

  useEffect(() => {
    async function loadStats() {
      if (!sequenceId) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchSequenceStats(sequenceId);
        if (data) {
          setStats(data);
        } else {
          setError('Failed to load sequence statistics.');
        }
      } catch (err: any) {
        console.error('Error fetching sequence stats:', err);
        setError(err.message || 'An error occurred while fetching data.');
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, [sequenceId, fetchSequenceStats]);

  if (isLoading) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="size-8 animate-spin mb-4 text-teal-500" />
        <p className="text-sm font-medium">Crunching sequence data...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/[0.02] border border-white/5 rounded-3xl">
        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="size-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Analytics Unavailable</h3>
        <p className="text-slate-400 max-w-xs mb-6 text-sm">
          {error || "We couldn't retrieve the performance data for this sequence."}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OutreachMetricCard 
          label="Total Sent" 
          value={stats.totalSent.toLocaleString()} 
          teal 
          icon={<Mail className="size-4" />} 
          sub="Delivered emails"
        />
        <OutreachMetricCard 
          label="Open Rate" 
          value={`${stats.openRate}%`} 
          icon={<TrendingUp className="size-4" />} 
          sub="Unique opens"
        />
        <OutreachMetricCard 
          label="Reply Rate" 
          value={`${stats.replyRate}%`} 
          icon={<MessageSquare className="size-4" />} 
          sub="Unique replies"
        />
        <OutreachMetricCard 
          label="Click Rate" 
          value={`${stats.clickRate}%`} 
          icon={<MousePointer className="size-4" />} 
          sub="Link engagement"
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engagement Chart */}
        <div className="lg:col-span-2 bg-white/[0.02] border border-white/8 rounded-3xl p-6">
          <OutreachSectionHeader
            icon={<BarChart2 />}
            title="Engagement Over Time"
            subtitle="Daily activity for the last 30 days"
          />
          <div className="h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dailyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  tick={{ fontSize: 10, fill: '#64748B' }} 
                  axisLine={false} 
                  tickLine={false} 
                  dy={10}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#64748B' }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <Tooltip content={<CUSTOM_TOOLTIP />} />
                <Legend 
                  wrapperStyle={{ fontSize: 10, paddingTop: 20 }} 
                  iconType="circle"
                />
                <Line type="monotone" dataKey="sent"    stroke="#475569" strokeWidth={2} dot={false} name="Sent" />
                <Line type="monotone" dataKey="opens"   stroke="#14B8A6" strokeWidth={2.5} dot={{ r: 3, fill: '#14B8A6' }} name="Opens" />
                <Line type="monotone" dataKey="replies" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3, fill: '#22C55E' }} name="Replies" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrollment Status */}
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6 h-full">
            <OutreachSectionHeader
              icon={<Users />}
              title="Enrollment Status"
              subtitle="Distribution of recipients"
            />
            
            <div className="space-y-6 mt-8">
              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 group-hover:scale-110 transition-transform">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active</p>
                    <p className="text-lg font-bold text-white">{stats.enrollmentStats.active}</p>
                  </div>
                </div>
                <OutreachBadge variant="teal" dot>In Progress</OutreachBadge>
              </div>

              <div className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Completed</p>
                    <p className="text-lg font-bold text-white">{stats.enrollmentStats.completed}</p>
                  </div>
                </div>
                <OutreachBadge variant="blue">Finished</OutreachBadge>
              </div>

              <div className="pt-6 border-t border-white/5 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-400">Total Enrolled</span>
                  </div>
                  <span className="text-xl font-black text-white">{stats.enrollmentStats.total}</span>
                </div>
                {/* Simple progress bar */}
                <div className="h-1.5 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-teal-500 rounded-full transition-all duration-1000" 
                    style={{ width: `${(stats.enrollmentStats.completed / (stats.enrollmentStats.total || 1)) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">
                  {Math.round((stats.enrollmentStats.completed / (stats.enrollmentStats.total || 1)) * 100)}% of sequence completions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
