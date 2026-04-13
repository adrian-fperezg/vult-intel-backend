import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, TrendingUp, Users, Mail, MousePointer2, 
  MessageSquare, AlertCircle, CheckCircle2, ArrowLeft,
  Calendar, Download, Filter, RefreshCcw
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell
} from 'recharts';
import { cn } from '@/lib/utils';
import { 
  OutreachMetricCard, OutreachBadge, TealButton,
  OutreachSectionHeader
} from '../OutreachCommon';
import { useOutreachApi, AnalyticsData } from '@/hooks/useOutreachApi';

interface CampaignAnalyticsDashboardProps {
  campaignId: string;
  campaignName: string;
  onBack: () => void;
}

export default function CampaignAnalyticsDashboard({ campaignId, campaignName, onBack }: CampaignAnalyticsDashboardProps) {
  const api = useOutreachApi();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(30);

  useEffect(() => {
    loadAnalytics();
  }, [campaignId, timeRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const result = await api.fetchAnalytics(timeRange.toString(), campaignId);
      setData(result);
    } catch (error) {
      console.error('Error fetching campaign analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCcw className="size-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  const stats: (Parameters<typeof OutreachMetricCard>[0])[] = [
    { label: 'Total Sent', value: data?.total_sent || 0, icon: <Mail />, teal: true },
    { label: 'Open Rate', value: `${data?.open_rate || '0.0'}%`, icon: <TrendingUp />, trend: 'up' as const, trendValue: '4.2%' },
    { label: 'Reply Rate', value: `${data?.reply_rate || '0.0'}%`, icon: <MessageSquare />, trend: 'up' as const, trendValue: '1.5%' },
    { label: 'Health Score', value: `${data?.health_score || 0}/100`, icon: <CheckCircle2 />, sub: 'Excellent' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background-dark">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors border border-transparent hover:border-white/10"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">{campaignName}</h1>
              <OutreachBadge variant="green" dot>Live</OutreachBadge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Performance analytics for the last {timeRange} days</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            {[7, 30, 90].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                  timeRange === range ? "bg-teal-500/20 text-teal-400 border border-teal-500/20" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {range}D
              </button>
            ))}
          </div>
          <TealButton variant="outline" size="sm">
            <Download className="size-4" /> Export
          </TealButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Top Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <OutreachMetricCard {...stat} />
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Chart */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8">
                <OutreachSectionHeader 
                  icon={<BarChart3 />} 
                  title="Engagement Over Time" 
                  subtitle="Daily opens and replies tracked across the campaign timeline"
                />
                <div className="h-[350px] mt-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.daily_data || []}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis 
                        dataKey="day" 
                        stroke="#64748b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(str) => {
                          if (!str) return '';
                          const date = new Date(str);
                          return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }}
                      />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => (val ?? 0).toLocaleString()} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1c2128', border: '1px solid #30363d', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="sent" stroke="#14B8A6" fillOpacity={1} fill="url(#colorSent)" strokeWidth={2} />
                      <Area type="monotone" dataKey="opens" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorOpens)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Conversion Funnel */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8">
                <OutreachSectionHeader 
                  icon={<Filter />} 
                  title="Efficiency Funnel" 
                  subtitle="How prospects are moving through your outreach steps"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
                  {[
                    { label: 'Outreach Sent', value: data?.total_sent || 0, color: 'text-slate-400' },
                    { label: 'Unique Opens', value: Math.round((data?.total_sent || 0) * (parseFloat(data?.open_rate || '0') / 100)), color: 'text-teal-400' },
                    { label: 'Replies', value: Math.round((data?.total_sent || 0) * (parseFloat(data?.reply_rate || '0') / 100)), color: 'text-green-400' },
                  ].map((item, idx) => (
                    <div key={item.label} className="relative flex flex-col items-center">
                      <div className={cn("text-4xl font-bold mb-2", item.color)}>{(item.value ?? 0).toLocaleString()}</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.label}</div>
                      {idx < 2 && (
                        <div className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2">
                          <TrendingUp className="size-4 text-slate-700" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar: Health & Insights */}
            <div className="space-y-6">
              <div className="bg-teal-500/5 border border-teal-500/20 rounded-[32px] p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-teal-500/20 rounded-xl">
                    <TrendingUp className="size-5 text-teal-400" />
                  </div>
                  <h3 className="font-bold text-white">Campaign Health</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 text-green-400" />
                      <span className="text-sm text-slate-300">Deliverability</span>
                    </div>
                    <span className="text-sm font-bold text-white">98.4%</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="size-4 text-yellow-500" />
                      <span className="text-sm text-slate-300">Unsubscribe Rate</span>
                    </div>
                    <span className="text-sm font-bold text-yellow-500">1.2%</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 text-green-400" />
                      <span className="text-sm text-slate-300">Bounce Rate</span>
                    </div>
                    <span className="text-sm font-bold text-white">0.8%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6">
                <h3 className="font-bold text-white mb-6">AI Performance Insights</h3>
                <div className="space-y-4">
                  {[
                    { title: "Great Open Rate", desc: "Your subject line is performing 15% better than industry average for SaaS founders.", type: 'positive' },
                    { title: "Follow-up Opportunity", desc: "Step 3 has the highest drop-off. Consider making the value proposition more concise.", type: 'neutral' },
                    { title: "Low Friday Engagement", desc: "Emails sent on Fridays are getting 40% fewer replies. Move your sends to Tue-Thu.", type: 'warning' },
                  ].map((insight) => (
                    <div key={insight.title} className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 group hover:bg-white/[0.04] transition-colors cursor-default">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={cn(
                          "size-2 rounded-full",
                          insight.type === 'positive' ? 'bg-green-400' : insight.type === 'warning' ? 'bg-amber-400' : 'bg-teal-400'
                        )} />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">{insight.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{insight.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
