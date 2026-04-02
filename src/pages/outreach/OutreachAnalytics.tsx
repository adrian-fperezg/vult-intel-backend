import { useState, useEffect } from 'react';
import {
  BarChart2, TrendingUp, Users, Mail, MousePointer,
  MessageSquare, Globe, AlertTriangle, CheckCircle2, Shield, Loader2,
  Sparkles, Download, X
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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchAnalytics, generateAiReport, exportAiReport, activeProjectId } = useOutreachApi();

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

  const handleGenerateReport = async () => {
    if (!data) return;
    setIsGeneratingReport(true);
    try {
      const res = await generateAiReport({ stats: data, timeRange });
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
      const blob = await exportAiReport();
      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VultIntel_Outreach_Report_${new Date().toISOString().split('T')[0]}.md`;
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
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
            <p className="text-sm text-slate-400 mt-0.5">Performance across all campaigns and mailboxes</p>
          </div>
          <div className="flex items-center gap-3">
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

            <button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingReport ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              🌐 Powered by Gemini: Generar Reporte
            </button>
          </div>
        </div>

        {/* Top Metrics - Focused Core */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OutreachMetricCard 
            label="Total Sent" 
            value={(data.total_sent ?? 0).toLocaleString()} 
            teal 
            icon={<Mail />} 
            trend={Number(data.sent_change ?? 0) >= 0 ? "up" : "down"}
            trendValue={`${Math.abs(Number(data.sent_change ?? 0))}%`} 
          />
          <OutreachMetricCard 
            label="Open Rate" 
            value={`${data.open_rate ?? '0.0'}%`} 
            icon={<TrendingUp />} 
            trend="neutral" 
            trendValue="vs average" 
            sub="Avg 21.5%" 
          />
          <OutreachMetricCard 
            label="Reply Rate" 
            value={`${data.reply_rate ?? '0.0'}%`} 
            icon={<MessageSquare />} 
            trend="neutral" 
            trendValue="vs average" 
            sub="Avg 3.2%"
          />
        </div>

        {/* Time Series Chart */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6">
          <OutreachSectionHeader
            icon={<BarChart2 />}
            title="Engagement Over Time"
            subtitle="Daily email volume and engagement metrics"
          />
          <ResponsiveContainer width="100%" height={300}>
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
            <div className="flex items-center gap-6 mt-4">
              <PieChart width={140} height={140}>
                <Pie data={data?.intent_data || []} cx={70} cy={70} innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {(data?.intent_data || []).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-3">
                {(data?.intent_data || []).map((item) => {
                  const name = item?.name || 'Unknown';
                  const value = item?.value || 0;
                  const color = item?.color || '#333';
                  return (
                    <div key={String(name)} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full shrink-0" style={{ background: color }} />
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
            <OutreachSectionHeader icon={<TrendingUp />} title="Top Performing Entities" subtitle="Response rates per campaign/sequence" />
            <ResponsiveContainer width="100%" height={200}>
              {(data?.campaign_comparison || []).length > 0 ? (
                <BarChart layout="vertical" data={data?.campaign_comparison || []} margin={{ left: 0, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="open"  name="Open Rate"  fill="#14B8A6" radius={[0, 4, 4, 0]} barSize={8} />
                  <Bar dataKey="reply" name="Reply Rate" fill="#22C55E" radius={[0, 4, 4, 0]} barSize={8} />
                </BarChart>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  No performance data available.
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0d1117] border border-white/10 w-full max-w-3xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col shadow-teal-500/10">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-xl bg-teal-500/10 flex items-center justify-center">
                  <Sparkles className="size-4 text-teal-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white leading-none">Gemini Performance Report</h3>
                  <p className="text-[11px] text-slate-500 mt-1">AI-generated outreach optimization insights</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="size-8 rounded-full flex items-center justify-center hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="prose prose-invert prose-slate prose-sm max-w-none text-slate-300 whitespace-pre-wrap font-mono text-[13px] leading-relaxed">
                {reportContent}
              </div>
            </div>

            <div className="px-8 py-5 bg-white/[0.02] border-t border-white/5 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-5 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleDownloadReport}
                className="flex items-center gap-2 px-5 py-2 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl text-xs transition-all"
              >
                <Download className="size-3" />
                Descargar Reporte (.md)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
