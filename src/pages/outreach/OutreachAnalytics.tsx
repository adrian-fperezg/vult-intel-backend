import { useState, useEffect } from 'react';
import {
  BarChart2, TrendingUp, Users, Mail, MousePointer,
  MessageSquare, Globe, AlertTriangle, CheckCircle2, Shield, Loader2,
  Sparkles, Download, X, Filter, Clock
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { OutreachMetricCard, OutreachBadge, OutreachSectionHeader } from './OutreachCommon';
import { cn } from '@/lib/utils';
import { useOutreachApi, AnalyticsData, FunnelStat } from '@/hooks/useOutreachApi';

// Industry benchmark constants — legitimate B2B email averages, not fake data.
// Source: Mailchimp 2024 industry averages for B2B / Technology sector.
const BENCHMARKS = {
  openRate:   { label: 'Industry avg', value: 21.5 },
  replyRate:  { label: 'Industry avg', value: 10.0 },
  bounceRate: { label: 'Safety limit', value: 2.5, lowerIsBetter: true },
};

/** Returns a sub-label like "Industry avg: 21.5% (you: +3.2pp)" */
function getBenchmarkSub(
  metric: keyof typeof BENCHMARKS,
  actualValue: number
): string {
  const b = BENCHMARKS[metric];
  const diff = parseFloat((actualValue - b.value).toFixed(1));
  const sign = diff > 0 ? '+' : '';
  return `${b.label}: ${b.value}% (you: ${sign}${diff}pp)`;
}

/** Converts a numeric percentage-point change to a display string like "+2.1" or "-0.4" */
function formatTrendValue(change: number | null | undefined): string {
  if (change == null) return '';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change}pp`;
}

/** Maps a numeric change to a trend direction for the MetricCard arrow. */
function trendDir(change: number | null | undefined, lowerIsBetter = false): 'up' | 'down' | 'neutral' {
  if (change == null || change === 0) return 'neutral';
  if (lowerIsBetter) return change < 0 ? 'up' : 'down';
  return change > 0 ? 'up' : 'down';
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

export default function OutreachAnalytics() {
  const [timeRange, setTimeRange] = useState<string>('30d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [funnelStats, setFunnelStats] = useState<FunnelStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchAnalytics, getFunnelStats, generateAiReport, exportAiReport, activeProjectId } = useOutreachApi();

  useEffect(() => {
    async function load() {
      if (!activeProjectId) return;
      setIsLoading(true);
      setError(null);
      try {
        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const [res, funnel] = await Promise.all([
          fetchAnalytics(timeRange, undefined, userTz),
          getFunnelStats(timeRange, userTz)
        ]);
        
        if (res) setData(res);
        if (funnel) setFunnelStats(funnel);
        
        if (!res) setError('No core analytics data returned.');
      } catch (err: any) {
        console.error('Failed to load analytics:', err);
        setError(err.message || 'Failed to connect to the analytics service.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [timeRange, activeProjectId, fetchAnalytics]);

  const handleGenerateReport = async () => {
    if (!data) return;
    setIsGeneratingReport(true);
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await generateAiReport({ timeframe: timeRange, timezone: userTz });
      if (res && res.report) {
        setReportContent(res.report);
        setShowReportModal(true);
      }
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const blob = await exportAiReport(timeRange, userTz);
      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VultIntel_Outreach_Report_${timeRange}_${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

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
      <div className="px-8 py-6 space-y-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white leading-none">Performance Overview</h1>
            <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
              <Globe className="size-3.5 text-teal-400" />
              Unified analytics across All Outreach Engines
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 hover:bg-white/10 transition-all group">
              <Clock className="size-4 text-teal-400 group-hover:scale-110 transition-transform" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-transparent border-none text-slate-300 text-xs font-bold outline-none cursor-pointer"
              >
                <option value="1d">Last 24h</option>
                <option value="3d">Last 3 days</option>
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 14 days</option>
                <option value="30d">Last 30 days</option>
                <option value="1m">Last month</option>
                <option value="Q1">Q1 (Jan-Mar)</option>
                <option value="Q2">Q2 (Apr-Jun)</option>
                <option value="Q3">Q3 (Jul-Sep)</option>
                <option value="Q4">Q4 (Oct-Dec)</option>
                <option value="1y">Last year</option>
              </select>
            </div>
            
            <button 
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="flex items-center gap-2 px-6 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-black text-[#0d1117] transition-all shadow-lg shadow-teal-500/20 active:scale-95"
            >
              {isGeneratingReport ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              AI REPORT
            </button>
          </div>
        </div>

        {/* Core KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <OutreachMetricCard 
            label="Total Outreach Volume" 
            value={(data.total_sent ?? 0).toLocaleString()} 
            teal 
            icon={<Mail className="size-4" />} 
            trend={Number(data.sent_change ?? 0) >= 0 ? "up" : "down"}
            trendValue={`${data.sent_change ?? '0'}%`} 
          />
          <OutreachMetricCard 
            label="Unified Open Rate" 
            value={`${data.open_rate ?? '0.0'}%`} 
            icon={<TrendingUp className="size-4" />} 
            trend={trendDir(data.open_rate_change)}
            trendValue={formatTrendValue(data.open_rate_change)}
            sub={getBenchmarkSub('openRate', parseFloat(data.open_rate ?? '0'))}
          />
          <OutreachMetricCard 
            label="Engagement / Reply Rate" 
            value={`${data.reply_rate ?? '0.0'}%`} 
            icon={<MessageSquare className="size-4" />} 
            trend={trendDir(data.reply_rate_change)}
            trendValue={formatTrendValue(data.reply_rate_change)}
            sub={getBenchmarkSub('replyRate', parseFloat(data.reply_rate ?? '0'))}
          />
          <OutreachMetricCard 
            label="Unified Bounce Rate" 
            value={`${data.bounce_rate ?? '0.0'}%`} 
            icon={<Shield className="size-4" />} 
            trend={trendDir(data.bounce_rate_change, true)}
            trendValue={formatTrendValue(data.bounce_rate_change)}
            sub={getBenchmarkSub('bounceRate', parseFloat(data.bounce_rate ?? '0'))}
          />
        </div>

        {/* Main Analytics Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Timeline */}
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-8 backdrop-blur-sm">
            <OutreachSectionHeader
              icon={<BarChart2 className="size-5 text-teal-400" />}
              title="Engagement Over Time"
              subtitle="Consolidated daily performance across campaigns and sequences."
            />
            <div className="h-[320px] mt-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    stroke="#334155" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val.split('T')[0]} // If it's a date string
                  />
                  <YAxis stroke="#334155" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                  <Line name="Sent" type="monotone" dataKey="sent" stroke="#14b8a6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                  <Line name="Opens" type="monotone" dataKey="opens" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line name="Replies" type="monotone" dataKey="replies" stroke="#f43f5e" strokeWidth={2} dot={false} />
                  <Line name="Bounces" type="monotone" dataKey="bounced" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel */}
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-8 backdrop-blur-sm">
            <OutreachSectionHeader
              icon={<Filter className="size-5 text-indigo-400" />}
              title="Unified Funnel Performance"
              subtitle="Comparing engagement efficiency by strategic funnel stage."
            />
            <div className="h-[320px] mt-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="funnel_stage" stroke="#334155" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#334155" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                  <Bar name="Volume (Sent)" dataKey="total_sent" fill="#14b8a6" radius={[6, 6, 0, 0]} barSize={40} />
                  <Bar name="Impact (Replies)" dataKey="total_replies" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Strategy Layer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Intent */}
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-8">
            <OutreachSectionHeader
              icon={<Sparkles className="size-5 text-amber-400" />}
              title="Global Intent Analysis"
              subtitle="AI Breakdown of reply sentiment across all outreach."
            />
            <div className="flex items-center gap-12 mt-8">
              <div className="size-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.intent_data || []}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {(data.intent_data || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-4">
                {(data.intent_data || []).map((item) => (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">{item.name}</span>
                      <span className="text-white font-bold">{item.value}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Leaders */}
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-8">
            <OutreachSectionHeader
              icon={<TrendingUp className="size-5 text-emerald-400" />}
              title="Top Performing Entities"
              subtitle="Highest response rates relative to total volume."
            />
            <div className="h-[240px] mt-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.campaign_comparison} margin={{ left: 0, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={120} tickLine={false} axisLine={false} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="reply" name="Reply Rate" fill="url(#emeraldGradient)" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="bounce" name="Bounce Rate" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={4} />
                  <defs>
                    <linearGradient id="emeraldGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Ai Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0b0e14] border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col ring-1 ring-white/5">
            <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-teal-500/5 to-transparent">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-2xl bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                  <Sparkles className="size-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Vult Intel: Strategic Analysis</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gemini-driven performance optimization</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="size-10 rounded-full flex items-center justify-center hover:bg-white/5 text-slate-400 hover:text-white transition-all"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-black/20">
              <div className="prose prose-invert prose-teal max-w-none prose-sm leading-relaxed text-slate-300 whitespace-pre-wrap font-sans">
                {reportContent}
              </div>
            </div>

            <div className="px-10 py-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
              <p className="text-[10px] text-slate-500 font-mono">CONFIDENTIAL: Strategic Sales Intelligence Report</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-6 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Close Window
                </button>
                <button
                  onClick={handleDownloadReport}
                  className="flex items-center gap-3 px-6 py-2.5 bg-white text-black font-bold rounded-2xl text-xs transition-all hover:bg-teal-50 shadow-lg shadow-white/5"
                >
                  <Download className="size-3.5" />
                  Descargar Reporte (.md)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
