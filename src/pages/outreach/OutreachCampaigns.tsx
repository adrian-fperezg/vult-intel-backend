import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, MoreHorizontal, Play, Pause, Copy, Trash2,
    Search, Users, Mail, TrendingUp, Clock, CheckCircle2,
    ChevronRight, Loader2, ListChecks, FolderOpen,
    Send, MousePointer2, MessageSquare, BarChart3,
    Calendar, Layers
  } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, LabelList 
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  OutreachBadge, OutreachMetricCard, OutreachEmptyState,
  TealButton, OutreachConfirmDialog
} from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import CampaignWizard from './campaigns/CampaignWizard';
import CampaignAnalyticsDashboard from './campaigns/CampaignAnalyticsDashboard';

type CampaignStatus = 'active' | 'paused' | 'draft' | 'completed' | 'scheduled';

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  funnel_stage: 'TOFU' | 'MOFU' | 'BOFU';
  leads: number;
  sent_count: number;
  opened_count: number;
  replied_count: number;
  createdAt: string;
  sequence?: string;
  pendingTasks: number;
}


const STATUS_CONFIG: Record<CampaignStatus, { labelKey: string; variant: 'green' | 'yellow' | 'gray' | 'teal' | 'blue' }> = {
  active:    { labelKey: 'outreach.campaigns.status.active',    variant: 'green' },
  paused:    { labelKey: 'outreach.campaigns.status.paused',    variant: 'yellow' },
  draft:     { labelKey: 'outreach.campaigns.status.draft',     variant: 'gray' },
  completed: { labelKey: 'outreach.campaigns.status.completed', variant: 'blue' },
  scheduled: { labelKey: 'outreach.campaigns.status.scheduled', variant: 'teal' },
};

export default function OutreachCampaigns() {
  const { t } = useTranslation();
  const { 
    activeProjectId, 
    fetchCampaigns, 
    fetchAnalytics, 
    getFunnelStats, 
    toggleCampaignStatus,
    deleteCampaign,
    launchCampaign,
    getDeliveryEstimate
  } = useOutreachApi();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [viewingAnalytics, setViewingAnalytics] = useState<Campaign | null>(null);
  const [funnelStage, setFunnelStage] = useState<'ALL' | 'TOFU' | 'MOFU' | 'BOFU'>('ALL');
  const [funnelStats, setFunnelStats] = useState<any[]>([]);
  const [searchParams] = useSearchParams();
  const timeframe = searchParams.get('timeframe') || '7d';
  const [analyticsData, setAnalyticsData] = useState<{ open_rate_change: number | null; reply_rate_change: number | null } | null>(null);

  const loadFunnelStats = useCallback(async (tf?: string, tz?: string) => {
    try {
      const stats = await getFunnelStats(tf, tz);
      setFunnelStats(stats || []);
    } catch (err) {
      console.error("Error loading funnel stats:", err);
    }
  }, [getFunnelStats]);

  const loadCampaigns = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [data, analytics] = await Promise.all([
        fetchCampaigns(timeframe, tz),
        fetchAnalytics(timeframe, undefined, tz),
        loadFunnelStats(timeframe, tz)
      ]);
      setCampaigns((data ?? []).map((c: any) => ({
        ...c,
        leads: c.leads || 0,
        sent_count: c.sent_count || 0,
        opened_count: c.opened_count || 0,
        replied_count: c.replied_count || 0,
        pendingTasks: c.pendingTasks || 0,
        createdAt: c.created_at ? c.created_at.slice(0, 10) : 'N/A',
      })));
      if (analytics) {
        setAnalyticsData({
          open_rate_change: analytics.open_rate_change ?? null,
          reply_rate_change: analytics.reply_rate_change ?? null,
        });
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, fetchCampaigns, fetchAnalytics, loadFunnelStats, timeframe]);

  // Immediately clear stale data when project switches, then re-fetch
  useEffect(() => {
    setCampaigns([]);
    setSelected(null);
    loadCampaigns();
  }, [loadCampaigns]);

  const handleCreate = () => {
    setIsWizardOpen(true);
  };

  const handleDuplicate = async (id: string) => {
    setIsDuplicating(id);
    setOpenMenu(null);
    await new Promise(r => setTimeout(r, 800));
    await handleCreate();
    setIsDuplicating(null);
  };

  // Calculate filtered stats
  const filteredCampaigns = campaigns.filter(c => funnelStage === 'ALL' || c.funnel_stage === funnelStage);
  
  const currentFunnelStat = funnelStats.find(s => s.funnel_stage === funnelStage) || {
    total_sent: funnelStats.reduce((acc, s) => acc + (s.total_sent || 0), 0),
    total_opens: funnelStats.reduce((acc, s) => acc + (s.total_opens || 0), 0),
    total_replies: funnelStats.reduce((acc, s) => acc + (s.total_replies || 0), 0),
    campaign_count: funnelStats.reduce((acc, s) => acc + (s.campaign_count || 0), 0)
  };

  const openRate = currentFunnelStat.total_sent > 0 
    ? (currentFunnelStat.total_opens / currentFunnelStat.total_sent * 100).toFixed(1)
    : "0";
  const replyRate = currentFunnelStat.total_sent > 0
    ? (currentFunnelStat.total_replies / currentFunnelStat.total_sent * 100).toFixed(1)
    : "0";

  const handleTogglePause = async (id: string) => {
    const c = campaigns.find(x => x.id === id);
    if (!c) return;
    setCampaigns(prev => prev.map(x => x.id === id ? { ...x, status: x.status === 'active' ? 'paused' : 'active' } : x));
    setOpenMenu(null);
    try {
      await toggleCampaignStatus(id, c.status);
    } catch {
      // Revert on failure
      setCampaigns(prev => prev.map(x => x.id === id ? { ...x, status: c.status } : x));
    }
  };

  const handleDelete = async (id: string) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selected === id) setSelected(null);
    try { await deleteCampaign(id); } catch { await loadCampaigns(); }
  };

  // Redesigned: Global KPIs
  const totalSent = funnelStats.reduce((acc, s) => acc + (s.total_sent || 0), 0);
  const totalOpens = funnelStats.reduce((acc, s) => acc + (s.total_opens || 0), 0);
  const totalReplies = funnelStats.reduce((acc, s) => acc + (s.total_replies || 0), 0);
  
  const avgOpenRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : "0";
  const avgReplyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : "0";

  // Recharts Data Transformation
  const chartData = ['TOFU', 'MOFU', 'BOFU'].map(stage => {
    const s = funnelStats.find(x => x.funnel_stage === stage) || { total_sent: 0, total_replies: 0 };
    return {
      name: t(`outreach.campaigns.funnel.${stage.toLowerCase()}`),
      sent: s.total_sent || 0,
      replies: s.total_replies || 0,
      rate: s.total_sent > 0 ? ((s.total_replies / s.total_sent) * 100).toFixed(1) : "0"
    };
  });

  const getFunnelVariant = (stage: string) => {
    if (stage === 'TOFU') return 'tofu';
    if (stage === 'MOFU') return 'mofu';
    return 'bofu';
  };

  if (!activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title={t('common.noProjectSelected')}
        description={t('common.noProjectDesc')}
      />
    );
  }

  if (viewingAnalytics) {
    return (
      <CampaignAnalyticsDashboard 
        campaignId={viewingAnalytics.id}
        campaignName={viewingAnalytics.name}
        onBack={() => setViewingAnalytics(null)}
      />
    );
  }

  return (
    <div className="p-8 space-y-10 max-w-[1600px] mx-auto min-h-screen bg-[#0d1117] text-white">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-4">
            {t('outreach.campaigns.title')}
            <div className="flex items-center gap-1 bg-teal-500/10 border border-teal-500/20 px-3 py-1 rounded-full">
              <div className="size-2 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase text-teal-400 tracking-widest">{t('outreach.campaigns.livePerformance')}</span>
            </div>
          </h1>
          <p className="text-slate-400 font-medium text-lg">{t('outreach.campaigns.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <TealButton 
            onClick={handleCreate}
            className="h-14 px-8 rounded-2xl shadow-2xl shadow-teal-500/20 active:scale-95 transition-all text-base"
          >
            <Plus className="size-5 mr-3 shrink-0" />
            {t('outreach.campaigns.newCampaign')}
          </TealButton>
        </div>
      </div>

      {/* SECTION 1: GLOBAL KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <OutreachMetricCard 
          label={t('outreach.campaigns.kpis.totalVolume')}
          value={totalSent.toLocaleString()} 
          icon={<Send className="text-sky-400" />}
          sub={t('outreach.campaigns.kpis.totalVolumeDesc')}
          teal
        />
        <OutreachMetricCard 
          label={t('outreach.campaigns.kpis.avgOpenRate')}
          value={`${avgOpenRate}%`} 
          icon={<MousePointer2 className="text-amber-400" />}
          trend={analyticsData?.open_rate_change == null ? 'neutral' : analyticsData.open_rate_change > 0 ? 'up' : 'down'}
          trendValue={analyticsData?.open_rate_change != null ? `${analyticsData.open_rate_change > 0 ? '+' : ''}${analyticsData.open_rate_change}pp` : undefined}
        />
        <OutreachMetricCard 
          label={t('outreach.campaigns.kpis.avgReplyRate')}
          value={`${avgReplyRate}%`} 
          icon={<MessageSquare className="text-emerald-400" />}
          trend={analyticsData?.reply_rate_change == null ? 'neutral' : analyticsData.reply_rate_change > 0 ? 'up' : 'down'}
          trendValue={analyticsData?.reply_rate_change != null ? `${analyticsData.reply_rate_change > 0 ? '+' : ''}${analyticsData.reply_rate_change}pp` : undefined}
        />
        <OutreachMetricCard 
          label={t('outreach.campaigns.kpis.conversionEngine')}
          value={campaigns.filter(c => c.status === 'active').length.toString()} 
          icon={<Play className="text-purple-400" />}
          sub={t('outreach.campaigns.kpis.activeCount')}
        />
      </div>

      {/* SECTION 2: FUNNEL PERFORMANCE VISUALIZATION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#161b22] border border-[#30363d] rounded-[32px] p-8 space-y-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <BarChart3 className="size-32" />
          </div>
          
          <div className="flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Layers className="size-5 text-teal-400" />
                {t('outreach.campaigns.funnel.throughput')}
              </h3>
              <p className="text-sm text-slate-500">{t('outreach.campaigns.funnel.throughputDesc')}</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-500">
               <div className="flex items-center gap-2">
                 <div className="size-3 rounded-full bg-teal-500/20 border border-teal-500/50" />
                 {t('outreach.campaigns.funnel.sent')}
               </div>
               <div className="flex items-center gap-2">
                 <div className="size-3 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]" />
                 {t('outreach.campaigns.funnel.replies')}
               </div>
            </div>
          </div>

          <div className="h-[300px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#8b949e', fontSize: 12, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#161b22', opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#0d1117] border border-[#30363d] p-4 rounded-xl shadow-2xl">
                          <p className="text-sm font-black text-white mb-2">{t('outreach.campaigns.funnel.analysis', { stage: data.name })}</p>
                          <div className="space-y-1">
                            <p className="text-xs text-slate-400 flex justify-between gap-8">{t('outreach.campaigns.funnel.sent')}: <span className="text-white font-bold">{data.sent}</span></p>
                            <p className="text-xs text-slate-400 flex justify-between gap-8">{t('outreach.campaigns.funnel.replies')}: <span className="text-teal-400 font-bold">{data.replies}</span></p>
                            <p className="text-[10px] font-black text-teal-500 pt-1 border-t border-white/5 mt-1">{t('outreach.campaigns.funnel.finalConversion', { rate: data.rate })}</p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="sent" radius={[8, 8, 8, 8]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`sent-${index}`} fill="rgba(20,184,166,0.1)" stroke="rgba(20,184,166,0.2)" strokeWidth={1} />
                  ))}
                </Bar>
                <Bar dataKey="replies" radius={[8, 8, 8, 8]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`reply-${index}`} fill="#14b8a6" />
                  ))}
                  <LabelList 
                    dataKey="rate" 
                    position="top" 
                    offset={10}
                    formatter={(val: any) => `${val}%`}
                    style={{ fill: '#14b8a6', fontSize: 10, fontWeight: 900 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#161b22] to-[#0d1117] border border-[#30363d] rounded-[32px] p-8 flex flex-col justify-between shadow-xl">
           <div className="space-y-6">
             <div className="space-y-1">
               <h3 className="text-xl font-bold flex items-center gap-2">
                 <TrendingUp className="size-5 text-teal-400" />
                 {t('outreach.campaigns.funnel.optimization')}
               </h3>
               <p className="text-sm text-slate-500">{t('outreach.campaigns.funnel.optimizationDesc')}</p>
             </div>
             
             <div className="space-y-4">
               {chartData.map(d => {
                 const lowRate = parseFloat(d.rate) < 2;
                 return (
                   <div key={d.name} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "size-10 rounded-xl flex items-center justify-center font-black text-xs border shrink-0",
                          d.name === 'TOFU' ? "bg-sky-500/10 border-sky-500/20 text-sky-400" :
                          d.name === 'MOFU' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                          "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        )}>
                          {d.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{t('outreach.campaigns.funnel.pipeline', { stage: d.name })}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{t('outreach.campaigns.funnel.prospectsActive', { count: d.sent })}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-black", lowRate ? "text-amber-500" : "text-teal-400")}>{d.rate}%</p>
                        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter">{lowRate ? t('outreach.campaigns.funnel.needsFocus') : t('outreach.campaigns.funnel.healthy')}</p>
                      </div>
                   </div>
                 );
               })}
             </div>
           </div>
           
           <div className="pt-6">
             <button className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-teal-500 hover:border-teal-400 transition-all">
               {t('outreach.campaigns.funnel.aiReport')}
             </button>
           </div>
        </div>
      </div>

      {/* SECTION 3: CAMPAIGNS TABLE */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-[32px] overflow-hidden shadow-2xl relative">
        <div className="p-8 border-b border-[#30363d] flex items-center justify-between bg-white/[0.02]">
           <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold">{t('outreach.campaigns.inventory.title')}</h3>
              <div className="flex items-center gap-2 h-8 px-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
                {['ALL', 'TOFU', 'MOFU', 'BOFU'].map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setFunnelStage(stage as any)}
                    className={cn(
                      "px-3 h-6 rounded-md text-[10px] font-black tracking-widest transition-all",
                      funnelStage === stage 
                        ? "bg-teal-500 text-white shadow-md shadow-teal-500/20" 
                        : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {t(`outreach.campaigns.funnel.${stage.toLowerCase()}`)}
                  </button>
                ))}
              </div>
           </div>
           <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="size-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-teal-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('outreach.campaigns.inventory.search')} 
                  className="h-10 pl-10 pr-4 bg-[#0d1117] border border-[#30363d] rounded-xl text-sm focus:outline-none focus:border-teal-500/50 transition-all w-64"
                />
              </div>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.01]">
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-[#30363d]">{t('outreach.campaigns.inventory.details')}</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-[#30363d]">{t('outreach.campaigns.inventory.stage')}</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-[#30363d]">{t('outreach.campaigns.inventory.status')}</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-[#30363d] text-center">{t('outreach.campaigns.inventory.performance')}</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-[#30363d] text-right">{t('outreach.campaigns.inventory.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Loader2 className="size-8 text-teal-500 animate-spin mx-auto mb-4" />
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('outreach.campaigns.inventory.loading')}</span>
                  </td>
                </tr>
              ) : filteredCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                     <Mail className="size-12 text-slate-700 mx-auto mb-4 opacity-50" />
                     <h4 className="text-xl font-bold text-slate-500">{t('outreach.campaigns.inventory.empty')}</h4>
                     <button onClick={handleCreate} className="mt-4 text-teal-400 font-bold hover:underline">{t('outreach.campaigns.inventory.deployFirst')}</button>
                  </td>
                </tr>
              ) : (
                filteredCampaigns.map((campaign) => {
                  const openRate = campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : '0';
                  const replyRate = campaign.sent_count > 0 ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1) : '0';
                  
                  return (
                    <motion.tr 
                      key={campaign.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-white/[0.02] group/row transition-colors"
                    >
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1">
                          <p className="text-base font-bold text-white group-hover/row:text-teal-400 transition-colors">{campaign.name}</p>
                          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span className="flex items-center gap-1"><Calendar className="size-3" /> {campaign.createdAt}</span>
                            <span className="flex items-center gap-1"><Users className="size-3" /> {t('outreach.campaigns.inventory.leads', { count: campaign.leads })}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <OutreachBadge variant={getFunnelVariant(campaign.funnel_stage)}>
                          {t(`outreach.campaigns.funnel.${campaign.funnel_stage.toLowerCase()}`)}
                        </OutreachBadge>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                           <div className={cn(
                             "size-2 rounded-full",
                             campaign.status === 'active' ? "bg-green-500 animate-pulse" : "bg-slate-600"
                           )} />
                           <span className={cn(
                             "text-[10px] font-black uppercase tracking-widest",
                             campaign.status === 'active' ? "text-green-500" : "text-slate-500"
                           )}>
                             {t(STATUS_CONFIG[campaign.status].labelKey)}
                           </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex items-center justify-center gap-10">
                            <div className="text-center">
                              <p className="text-sm font-black text-white">{campaign.sent_count}</p>
                              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-tighter">{t('outreach.campaigns.inventory.sent')}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-black text-teal-400">{openRate}%</p>
                              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-tighter">{t('outreach.campaigns.inventory.open')}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-black text-blue-400">{replyRate}%</p>
                              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-tighter">{t('outreach.campaigns.inventory.reply')}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setViewingAnalytics(campaign)}
                            className="p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-400 hover:text-white hover:border-teal-500/50 transition-all"
                            title="Analytics"
                          >
                            <TrendingUp className="size-4" />
                          </button>
                          <div className="relative">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu(openMenu === campaign.id ? null : campaign.id);
                              }}
                              className="p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-slate-400 hover:text-white hover:border-teal-500/50 transition-all"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            
                            {openMenu === campaign.id && (
                              <div className="absolute right-0 mt-3 w-52 bg-[#1c2128] border border-[#30363d] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-30 overflow-hidden backdrop-blur-xl">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleTogglePause(campaign.id); }}
                                  className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-300 hover:bg-teal-500/10 hover:text-teal-400 transition-colors flex items-center gap-3"
                                >
                                  {campaign.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}
                                  {campaign.status === 'active' ? t('outreach.campaigns.menu.pause') : t('outreach.campaigns.menu.resume')}
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign.id); }}
                                  className="w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-300 hover:bg-teal-500/10 hover:text-teal-400 transition-colors flex items-center gap-3"
                                >
                                  <Copy className="size-4" /> {t('outreach.campaigns.menu.duplicate')}
                                </button>
                                <div className="h-px bg-[#30363d] my-1" />
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setDeleteDialog(campaign.id); setOpenMenu(null); }}
                                  className="w-full px-4 py-2.5 text-left text-sm font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3"
                                >
                                  <Trash2 className="size-4" /> {t('outreach.campaigns.menu.terminate')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OutreachConfirmDialog
        isOpen={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => deleteDialog && handleDelete(deleteDialog)}
        title={t('outreach.campaigns.delete.title')}
        description={t('outreach.campaigns.delete.desc')}
        confirmLabel={t('outreach.campaigns.delete.confirm')}
        danger
      />

      <CampaignWizard 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={loadCampaigns}
      />
    </div>
  );
}
