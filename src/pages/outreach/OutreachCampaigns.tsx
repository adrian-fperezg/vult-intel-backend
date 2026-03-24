import { useState, useEffect } from 'react';
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

type CampaignStatus = 'active' | 'paused' | 'draft' | 'completed' | 'scheduled';

interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  leads: number;
  sent: number;
  openRate: number;
  replyRate: number;
  clickRate: number;
  createdAt: string;
  sequence?: string;
  pendingTasks: number;
}

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1', name: 'Q1 SaaS Decision Makers Outreach', status: 'active',
    leads: 342, sent: 218, openRate: 42.3, replyRate: 8.7, clickRate: 6.1,
    createdAt: '2026-03-01', sequence: 'Cold → Warm (5-Step)', pendingTasks: 4
  },
  {
    id: '2', name: 'Agency Founders Re-Engagement', status: 'active',
    leads: 87, sent: 87, openRate: 61.2, replyRate: 14.9, clickRate: 9.8,
    createdAt: '2026-03-10', sequence: 'Re-Engagement (3-Step)', pendingTasks: 1
  },
  {
    id: '3', name: '[TEST] Cold Email — Fintech Segment', status: 'paused',
    leads: 50, sent: 30, openRate: 28.0, replyRate: 3.3, clickRate: 1.5,
    createdAt: '2026-02-20', sequence: 'A/B Test Variant', pendingTasks: 0
  },
  {
    id: '4', name: 'Product Launch Announcement', status: 'draft',
    leads: 0, sent: 0, openRate: 0, replyRate: 0, clickRate: 0,
    createdAt: '2026-03-18', sequence: 'Launch Drip (7-Step)', pendingTasks: 0
  },
];

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

  useEffect(() => {
    loadCampaigns();
  }, [api.activeProjectId]);

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchCampaigns();
      setCampaigns((data ?? []).map((c: any) => ({
        ...c,
        leads: c.leads || 0,
        sent: c.sent || 0,
        openRate: c.openRate || 0,
        replyRate: c.replyRate || 0,
        clickRate: c.clickRate || 0,
        pendingTasks: c.pendingTasks || 0,
        createdAt: c.created_at ? c.created_at.slice(0, 10) : 'N/A',
      })));
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const avgOpenRate = campaigns.filter(c => c.sent > 0).reduce((s, c) => s + c.openRate, 0) / Math.max(campaigns.filter(c => c.sent > 0).length, 1);
  const avgReplyRate = campaigns.filter(c => c.sent > 0).reduce((s, c) => s + c.replyRate, 0) / Math.max(campaigns.filter(c => c.sent > 0).length, 1);
  const totalTasks = campaigns.reduce((s, c) => s + c.pendingTasks, 0);

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top Stats */}
      <div className="px-8 py-6 border-b border-white/5 bg-background-dark shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Campaigns</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage and launch your outreach campaigns</p>
          </div>
          <TealButton onClick={handleCreate}>
            <Plus className="size-4" /> New Campaign
          </TealButton>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <OutreachMetricCard label="Total Sent" value={totalSent.toLocaleString()} teal icon={<Mail />} trend="up" trendValue="12% this week" />
          <OutreachMetricCard label="Avg Open Rate" value={`${avgOpenRate.toFixed(1)}%`} icon={<TrendingUp />} trend="up" trendValue="vs 21% industry" />
          <OutreachMetricCard label="Avg Reply Rate" value={`${avgReplyRate.toFixed(1)}%`} icon={<CheckCircle2 />} trend="up" trendValue="vs 5% industry" />
          <OutreachMetricCard label="Pending Tasks" value={totalTasks} icon={<ListChecks />} sub="due today" />
        </div>
      </div>

      {/* Campaign List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {campaigns.length === 0 ? (
          <OutreachEmptyState
            icon={<Mail />}
            title="No campaigns yet"
            description="Create your first outreach campaign to start connecting with prospects at scale."
            action={<TealButton onClick={handleCreate}><Plus className="size-4" /> New Campaign</TealButton>}
          />
        ) : (
          <div className="p-6 space-y-3">
            {campaigns.map((campaign) => {
              const statusCfg = STATUS_CONFIG[campaign.status];
              const isActive = selected === campaign.id;
              return (
                <motion.div
                  key={campaign.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  onClick={() => setSelected(isActive ? null : campaign.id)}
                  className={cn(
                    'rounded-2xl border p-5 cursor-pointer transition-all group relative',
                    isActive
                      ? 'bg-teal-500/5 border-teal-500/30'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={cn(
                        'size-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        campaign.status === 'active' ? 'bg-teal-500/10 border border-teal-500/20' : 'bg-white/5 border border-white/10'
                      )}>
                        <Mail className={cn('size-5', campaign.status === 'active' ? 'text-teal-400' : 'text-slate-500')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-semibold text-white text-sm truncate">{String(campaign.name || 'Untitled')}</h3>
                          <OutreachBadge variant={statusCfg.variant} dot={campaign.status === 'active'}>
                            {String(statusCfg.label)}
                          </OutreachBadge>
                          {isDuplicating === campaign.id && (
                            <Loader2 className="size-3.5 animate-spin text-teal-400" />
                          )}
                        </div>
                        {campaign.sequence && (
                          <p className="text-xs text-slate-500 mt-1">{String(campaign.sequence)}</p>
                        )}
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Users className="size-3.5" /> {campaign.leads} leads
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Mail className="size-3.5" /> {campaign.sent} sent
                          </span>
                          {campaign.sent > 0 && (
                            <>
                              <span className="text-xs font-semibold text-teal-400">{campaign.openRate}% opens</span>
                              <span className="text-xs font-semibold text-green-400">{campaign.replyRate}% replies</span>
                              <span className="text-xs text-slate-500">{campaign.clickRate}% clicks</span>
                            </>
                          )}
                          {campaign.pendingTasks > 0 && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                              <ListChecks className="size-3.5" /> {campaign.pendingTasks} task{campaign.pendingTasks > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-slate-600">
                            <Clock className="size-3" /> {String(campaign.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronRight className={cn('size-4 text-slate-600 transition-transform', isActive && 'rotate-90')} />
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === campaign.id ? null : campaign.id); }}
                          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        {openMenu === campaign.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 z-20 bg-[#1c2128] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTogglePause(campaign.id); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                              >
                                {campaign.status === 'active' ? <Pause className="size-4" /> : <Play className="size-4" />}
                                {campaign.status === 'active' ? 'Pause' : 'Resume'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDuplicate(campaign.id); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                              >
                                <Copy className="size-4" /> Duplicate
                              </button>
                              <hr className="border-white/5" />
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteDialog(campaign.id); setOpenMenu(null); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="size-4" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
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
                            { label: 'Delivered', value: `${campaign.sent}` },
                            { label: 'Open Rate', value: `${campaign.openRate}%`, teal: true },
                            { label: 'Click Rate', value: `${campaign.clickRate}%` },
                            { label: 'Reply Rate', value: `${campaign.replyRate}%` },
                            { label: 'Bounced', value: '2.1%' },
                            { label: 'Unsub', value: '0.4%' },
                          ].map(({ label, value, teal }) => (
                            <div key={label} className="text-center">
                              <p className={cn('text-lg font-bold tabular-nums', teal ? 'text-teal-400' : 'text-white')}>{value}</p>
                              <p className="text-[10px] uppercase tracking-wider text-slate-600 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <TealButton size="sm">View Analytics</TealButton>
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
          </div>
        )}
      </div>

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
