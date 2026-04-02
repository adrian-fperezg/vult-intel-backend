import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, MoreHorizontal, Play, Pause, Copy, Trash2,
  Users, Mail, TrendingUp, Clock, CheckCircle2,
  ChevronRight, Loader2, ListChecks, FolderOpen
} from 'lucide-react';
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


const STATUS_CONFIG: Record<CampaignStatus, { label: string; variant: 'green' | 'yellow' | 'gray' | 'teal' | 'blue' }> = {
  active:    { label: 'Active',    variant: 'green' },
  paused:    { label: 'Paused',    variant: 'yellow' },
  draft:     { label: 'Draft',     variant: 'gray' },
  completed: { label: 'Completed', variant: 'blue' },
  scheduled: { label: 'Scheduled', variant: 'teal' },
};

export default function OutreachCampaigns() {
  const api = useOutreachApi();
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

  const loadFunnelStats = useCallback(async () => {
    try {
      const stats = await api.getFunnelStats();
      setFunnelStats(stats || []);
    } catch (err) {
      console.error("Error loading funnel stats:", err);
    }
  }, [api.getFunnelStats]);

  const loadCampaigns = useCallback(async () => {
    if (!api.activeProjectId) return;
    setIsLoading(true);
    try {
      const [data] = await Promise.all([
        api.fetchCampaigns(),
        loadFunnelStats()
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
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api.activeProjectId, api.fetchCampaigns, loadFunnelStats]);

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
      await api.toggleCampaignStatus(id, c.status);
    } catch {
      // Revert on failure
      setCampaigns(prev => prev.map(x => x.id === id ? { ...x, status: c.status } : x));
    }
  };

  const handleDelete = async (id: string) => {
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (selected === id) setSelected(null);
    try { await api.deleteCampaign(id); } catch { await loadCampaigns(); }
  };

  if (!api.activeProjectId) {
    return (
      <OutreachEmptyState
        icon={<FolderOpen />}
        title="No project selected"
        description="Select a project from the top bar to view and manage its campaigns."
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
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto min-h-screen bg-[#0d1117] text-white">
      {/* Header & Stats */}
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              Outreach Campaigns
              <OutreachBadge variant="teal" className="text-xs py-0.5 px-2">Funnel Analytics</OutreachBadge>
            </h1>
            <p className="text-slate-400 font-medium">Strategize and monitor your B2B sales funnel performance.</p>
          </div>
          <TealButton 
            onClick={handleCreate}
            className="h-12 px-6 rounded-xl shadow-lg shadow-teal-500/20 active:scale-95 transition-transform"
          >
            <Plus className="size-5 mr-3" />
            New Campaign
          </TealButton>
        </div>

        {/* Funnel Navigation */}
        <div className="flex items-center justify-between bg-[#161b22] border border-[#30363d] p-1.5 rounded-2xl w-fit">
          {['ALL', 'TOFU', 'MOFU', 'BOFU'].map((stage) => (
            <button
              key={stage}
              onClick={() => setFunnelStage(stage as any)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2",
                funnelStage === stage 
                  ? "bg-teal-500 text-white shadow-xl shadow-teal-500/20" 
                  : "text-slate-400 hover:text-white"
              )}
            >
              {stage === 'ALL' && <ListChecks className="size-4" />}
              {stage}
              <span className={cn(
                "ml-1 text-[10px] px-1.5 py-0.5 rounded-lg",
                funnelStage === stage ? "bg-white/20" : "bg-white/5"
              )}>
                {stage === 'ALL' 
                  ? campaigns.length 
                  : campaigns.filter(c => c.funnel_stage === stage).length
                }
              </span>
            </button>
          ))}
        </div>

        {/* Funnel KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <OutreachMetricCard 
            label="Total Sent" 
            value={currentFunnelStat.total_sent.toLocaleString()} 
            icon={<Mail className="text-teal-400" />}
            trend="up"
            trendValue="+12.5%"
          />
          <OutreachMetricCard 
            label="Open Rate" 
            value={`${openRate}%`} 
            icon={<TrendingUp className="text-blue-400" />}
            trend="up"
            trendValue="+2.1%"
          />
          <OutreachMetricCard 
            label="Reply Rate" 
            value={`${replyRate}%`} 
            icon={<Users className="text-purple-400" />}
            trend="down"
            trendValue="-0.4%"
          />
          <OutreachMetricCard 
            label="Active Campaigns" 
            value={filteredCampaigns.filter(c => c.status === 'active').length.toString()} 
            icon={<Play className="text-green-400" />}
          />
        </div>
      </div>

      {/* Campaigns Grid */}
      {isLoading ? (
        <div className="h-[400px] flex flex-col items-center justify-center gap-4 bg-[#161b22]/50 rounded-3xl border border-[#30363d] backdrop-blur-xl">
          <div className="relative">
            <div className="size-16 rounded-full border-4 border-teal-500/10 border-t-teal-500 animate-spin" />
            <Loader2 className="size-6 text-teal-400 animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <span className="text-sm font-bold text-slate-400 animate-pulse">Loading funnel performance...</span>
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <OutreachEmptyState
          icon={<Mail />}
          title="No campaigns found"
          description={funnelStage === 'ALL' ? "Create your first outreach campaign to start generating leads." : `No ${funnelStage} campaigns found. Start one to fill this stage.`}
          action={<TealButton onClick={handleCreate}><Plus className="size-4" /> New Campaign</TealButton>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredCampaigns.map((campaign) => {
              const isActive = selected === campaign.id;
              const campaignOpenRate = campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : '0';
              const campaignReplyRate = campaign.sent_count > 0 ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1) : '0';

              return (
                <motion.div
                  key={campaign.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  onClick={() => setSelected(isActive ? null : campaign.id)}
                  className={cn(
                    'rounded-3xl border p-6 cursor-pointer transition-all group relative bg-[#161b22] border-[#30363d] hover:border-teal-500/50',
                    isActive && 'ring-2 ring-teal-500/20 border-teal-500'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                        <OutreachBadge variant={STATUS_CONFIG[campaign.status].variant}>
                          {STATUS_CONFIG[campaign.status].label}
                        </OutreachBadge>
                        <span className={cn(
                          "text-[10px] font-black tracking-widest px-2 py-0.5 rounded-md uppercase",
                          campaign.funnel_stage === 'TOFU' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                          campaign.funnel_stage === 'MOFU' ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                          "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        )}>
                          {campaign.funnel_stage}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white group-hover:text-teal-400 transition-colors line-clamp-1">
                        {campaign.name}
                      </h3>
                    </div>
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu === campaign.id ? null : campaign.id);
                        }}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400"
                      >
                        <MoreHorizontal className="size-5" />
                      </button>
                      
                      {openMenu === campaign.id && (
                        <div className="absolute right-0 mt-2 w-48 bg-[#1c2128] border border-[#30363d] rounded-2xl shadow-2xl py-2 z-20 overflow-hidden backdrop-blur-xl">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleTogglePause(campaign.id); }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-teal-500/10 hover:text-teal-400 transition-colors flex items-center gap-3"
                          >
                            {campaign.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}
                            {campaign.status === 'active' ? 'Pause Campaign' : 'Resume Campaign'}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign.id); }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-teal-500/10 hover:text-teal-400 transition-colors flex items-center gap-3"
                          >
                            <Copy className="size-4" /> Duplicate
                          </button>
                          <div className="h-px bg-[#30363d] my-1" />
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteDialog(campaign.id); setOpenMenu(null); }}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3"
                          >
                            <Trash2 className="size-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sent</span>
                      <p className="text-lg font-black text-white">{campaign.sent_count}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Open</span>
                      <p className="text-lg font-black text-teal-400">
                        {campaignOpenRate}%
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reply</span>
                      <p className="text-lg font-black text-blue-400">
                        {campaignReplyRate}%
                      </p>
                    </div>
                  </div>

                  {/* Expanded Detail Row */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-5 pt-5 border-t border-white/5 grid grid-cols-3 md:grid-cols-6 gap-3">
                          {[
                            { label: 'Delivered', value: `${campaign.sent_count}` },
                            { label: 'Open Rate', value: `${campaignOpenRate}%`, teal: true },
                            { label: 'Click Rate', value: `${(campaign as any).clickRate || 0}%` },
                            { label: 'Reply Rate', value: `${campaignReplyRate}%` },
                            { label: 'Bounced', value: '0%' },
                            { label: 'Unsub', value: '0%' },
                          ].map(({ label, value, teal }) => (
                            <div key={label} className="text-center">
                              <p className={cn('text-lg font-bold tabular-nums', teal ? 'text-teal-400' : 'text-white')}>{value}</p>
                              <p className="text-[10px] uppercase tracking-wider text-slate-600 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <TealButton size="sm" onClick={(e) => { e.stopPropagation(); setViewingAnalytics(campaign); }}>
                            View Analytics
                          </TealButton>
                          <button className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                            Edit Campaign
                          </button>
                          <button className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                            Manage Leads
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <OutreachConfirmDialog
        isOpen={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => deleteDialog && handleDelete(deleteDialog)}
        title="Delete campaign?"
        description="This campaign and all its configuration will be permanently deleted. Enrolled lead data and analytics are preserved."
        confirmLabel="Delete Campaign"
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
