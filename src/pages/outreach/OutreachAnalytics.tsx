import { useState } from 'react';
import {
  BarChart2, TrendingUp, Users, Mail, MousePointer,
  MessageSquare, Globe, AlertTriangle, CheckCircle2, Shield
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { OutreachMetricCard, OutreachBadge, OutreachSectionHeader } from './OutreachCommon';
import { cn } from '@/lib/utils';

const DAILY_DATA = [
  { day: 'Mar 8',  sent: 40,  opens: 17, replies: 4, clicks: 3 },
  { day: 'Mar 9',  sent: 52,  opens: 24, replies: 5, clicks: 4 },
  { day: 'Mar 10', sent: 61,  opens: 28, replies: 6, clicks: 5 },
  { day: 'Mar 11', sent: 45,  opens: 19, replies: 3, clicks: 2 },
  { day: 'Mar 12', sent: 72,  opens: 33, replies: 8, clicks: 7 },
  { day: 'Mar 13', sent: 55,  opens: 24, replies: 5, clicks: 4 },
  { day: 'Mar 14', sent: 68,  opens: 31, replies: 7, clicks: 6 },
];

const INTENT_DATA = [
  { name: 'Interested',       value: 31, color: '#14B8A6' },
  { name: 'Meeting Request',  value: 18, color: '#22C55E' },
  { name: 'Not Now',          value: 24, color: '#EAB308' },
  { name: 'Unsubscribe',      value: 8,  color: '#EF4444' },
  { name: 'Out of Office',    value: 12, color: '#64748B' },
  { name: 'Other',            value: 7,  color: '#3B82F6' },
];

const MAILBOX_HEALTH = [
  { email: 'alex@company.com',  score: 92, status: 'excellent', sent: 1240, bounceRate: 1.2, spamRate: 0.1 },
  { email: 'sales@company.com', score: 78, status: 'good',      sent: 643,  bounceRate: 2.1, spamRate: 0.3 },
  { email: 'hello@company.com', score: 61, status: 'fair',      sent: 320,  bounceRate: 4.5, spamRate: 0.8 },
];

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

  const totalSent = DAILY_DATA.reduce((s, d) => s + d.sent, 0);
  const totalOpens = DAILY_DATA.reduce((s, d) => s + d.opens, 0);
  const totalReplies = DAILY_DATA.reduce((s, d) => s + d.replies, 0);
  const totalClicks = DAILY_DATA.reduce((s, d) => s + d.clicks, 0);

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
          <OutreachMetricCard label="Total Sent" value={totalSent.toLocaleString()} teal icon={<Mail />} trend="up" trendValue="+14% vs last week" />
          <OutreachMetricCard label="Open Rate" value={`${((totalOpens / totalSent) * 100).toFixed(1)}%`} icon={<TrendingUp />} trend="up" trendValue="vs 21% avg" sub="industry avg 21%" />
          <OutreachMetricCard label="Reply Rate" value={`${((totalReplies / totalSent) * 100).toFixed(1)}%`} icon={<MessageSquare />} trend="up" trendValue="vs 5% avg" />
          <OutreachMetricCard label="Click Rate" value={`${((totalClicks / totalSent) * 100).toFixed(1)}%`} icon={<MousePointer />} trend="neutral" trendValue="stable" />
        </div>

        {/* Time Series Chart */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
          <OutreachSectionHeader
            icon={<BarChart2 />}
            title="Engagement Over Time"
            subtitle="Daily email volume and engagement metrics"
          />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={DAILY_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="sent"    stroke="#475569"   strokeWidth={1.5} dot={false} name="Sent" />
              <Line type="monotone" dataKey="opens"   stroke="#14B8A6"   strokeWidth={2}   dot={false} name="Opens" />
              <Line type="monotone" dataKey="replies" stroke="#22C55E"   strokeWidth={2}   dot={false} name="Replies" />
              <Line type="monotone" dataKey="clicks"  stroke="#A78BFA"   strokeWidth={1.5} dot={false} name="Clicks" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Intent Breakdown */}
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
            <OutreachSectionHeader icon={<MessageSquare />} title="Reply Intent Breakdown" subtitle="AI-categorized reply intent" />
            <div className="flex items-center gap-4">
              <PieChart width={140} height={140}>
                <Pie data={INTENT_DATA} cx={70} cy={70} innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {INTENT_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-2">
                {INTENT_DATA.map(({ name, value, color }) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-slate-400">{name}</span>
                    </div>
                    <span className="font-bold text-white">{value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Campaign Comparison */}
          <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
            <OutreachSectionHeader icon={<BarChart2 />} title="Campaign Comparison" subtitle="Open & reply rates per campaign" />
            <ResponsiveContainer width="100%" height={160}>
              <BarChart layout="vertical" data={[
                { name: 'Q1 SaaS DMs',      open: 42.3, reply: 8.7 },
                { name: 'Agency Re-Engage', open: 61.2, reply: 14.9 },
                { name: 'Fintech Test',     open: 28.0, reply: 3.3 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<CUSTOM_TOOLTIP />} />
                <Bar dataKey="open"  name="Open Rate"  fill="#14B8A6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="reply" name="Reply Rate" fill="#22C55E" radius={[0, 4, 4, 0]} />
              </BarChart>
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
            {MAILBOX_HEALTH.map(({ email, score, status, sent, bounceRate, spamRate }) => {
              const scoreColor = score >= 85 ? '#14B8A6' : score >= 70 ? '#EAB308' : '#EF4444';
              const scoreBadge = score >= 85 ? 'teal' : score >= 70 ? 'yellow' : 'red';
              return (
                <div key={email} className="flex items-center gap-5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                  <div style={{ '--score-color': scoreColor } as any} className="relative size-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5" />
                      <circle
                        cx="18" cy="18" r="15" fill="none"
                        stroke={scoreColor} strokeWidth="2.5"
                        strokeDasharray={`${(score / 100) * 94.2} 94.2`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: scoreColor }}>{score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-white text-sm">{email}</p>
                      <OutreachBadge variant={scoreBadge as any}>
                        {status}
                      </OutreachBadge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{sent.toLocaleString()} sent</span>
                      <span className={bounceRate > 3 ? 'text-red-400' : 'text-slate-400'}>Bounce: {bounceRate}%</span>
                      <span className={spamRate > 0.5 ? 'text-amber-400' : 'text-slate-400'}>Spam: {spamRate}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    {score >= 85 && <CheckCircle2 className="size-4 text-teal-400" />}
                    {score < 85 && score >= 70 && <AlertTriangle className="size-4 text-amber-400" />}
                    {score < 70 && <AlertTriangle className="size-4 text-red-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
