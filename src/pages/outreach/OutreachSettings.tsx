import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, Plus, MoreHorizontal, CheckCircle2, AlertTriangle, XCircle,
  Zap, Code2, Bell, Shield, Copy, Eye, EyeOff, ChevronDown,
  Wifi, Thermometer, Search, Key, Webhook, Users2, RefreshCw, Loader2, FolderOpen,
  Settings2, ExternalLink, User, Globe, Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutreachBadge, TealButton, OutreachEmptyState } from './OutreachCommon';
import { toast } from 'react-hot-toast';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { DomainAliasCard } from './components/DomainAliasCard';
import DomainVerificationManager from './components/DomainVerificationManager';
import TipTapEditor from './components/TipTapEditor';

type SettingsTab = 'mailboxes' | 'warmup' | 'snippets' | 'integrations' | 'api' | 'notifications';

const extractVars = (html: string) => {
  const matches = html.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  // removing {{ and }}
  return [...new Set(matches.map(m => m.replace(/^{{|}}$/g, '')))];
};

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<any> }> = [
  { id: 'mailboxes',     label: 'Mailboxes',     icon: Mail },
  { id: 'warmup',       label: 'Warmup',         icon: Thermometer },
  { id: 'snippets',     label: 'Snippets',       icon: Code2 },
  { id: 'integrations', label: 'Integrations',   icon: Zap },
  { id: 'api',          label: 'API & Webhooks', icon: Webhook },
  { id: 'notifications',label: 'Notifications',  icon: Bell },
];

interface Mailbox {
  id: string;
  email: string;
  name?: string;
  score?: number;
  status?: 'healthy' | 'warning' | 'degraded';
  dailyLimit?: number;
  sent?: number;
  spf?: boolean;
  dkim?: boolean;
  dmarc?: boolean;
  warmupActive?: boolean;
  connection_type?: 'gmail' | 'smtp';
  aliases?: Array<{ email: string; name: string }>;
  provider?: 'gmail' | 'smtp'; // Added provider for AliasManager
}



const MOCK_API_KEY = 'vlt_live_9f4e2b7c3d1a8e6f0b5c9a2d7f4e1b8c3d6a9f2e5b8c1d4f7a0e3b6c9d2f5a8';

export default function OutreachSettings() {
  const api = useOutreachApi();
  const [activeTab, setActiveTab] = useState<SettingsTab>('mailboxes');
  const [showApiKey, setShowApiKey] = useState(false);
  const [expandedMailbox, setExpandedMailbox] = useState<string | null>(null);
  const [notifications, setNotifications] = useState({
    replyReceived: true, hotLead: true, bounce: true, slackEnabled: false, browserEnabled: true,
  });
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxesLoading, setMailboxesLoading] = useState(true);
  const [verifiedDomains, setVerifiedDomains] = useState<any[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Snippets States
  const [snippets, setSnippets] = useState<any[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [snippetModalType, setSnippetModalType] = useState<'standard' | 'signature' | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<any>(null);
  const [snippetName, setSnippetName] = useState('');
  const [snippetBody, setSnippetBody] = useState('');
  const [snippetSaving, setSnippetSaving] = useState(false);

  const standardSnippets = snippets.filter(s => s.type !== 'signature');
  const signatureSnippets = snippets.filter(s => s.type === 'signature');

  const slugify = (text: string) => text.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');

  // Integration States
  const [hunterKeyInput, setHunterKeyInput] = useState('');
  const [zbKeyInput, setZbKeyInput] = useState('');
  const [pdlKeyInput, setPdlKeyInput] = useState('');
  
  const [has_hunter, setHasHunter] = useState(false);
  const [has_zerobounce, setHasZb] = useState(false);
  const [has_pdl, setHasPdl] = useState(false);

  const [savingHunter, setSavingHunter] = useState(false);
  const [savingZb, setSavingZb] = useState(false);
  const [savingPdl, setSavingPdl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [hunterAccount, setHunterAccount] = useState<any>(null);
  const [zbCredits, setZbCredits] = useState<any>(null);
  const [pdlUsage, setPdlUsage] = useState<any>(null);

  const [showHunterSetup, setShowHunterSetup] = useState(false);
  const [showZbSetup, setShowZbSetup] = useState(false);
  const [showPdlSetup, setShowPdlSetup] = useState(false);

  const [fetchingHunter, setFetchingHunter] = useState(false);
  const [fetchingZb, setFetchingZb] = useState(false);
  const [fetchingPdl, setFetchingPdl] = useState(false);


  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectMode, setConnectMode] = useState<'picker' | 'smtp'>('picker');
  const [smtpConfig, setSmtpConfig] = useState({
    email: '', name: '', smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '',
    imap_host: '', imap_port: 993, imap_secure: true,
  });

  // Reload data when the tab changes (within the same project)
  useEffect(() => {
    if (activeTab === 'integrations' && api.activeProjectId) {
      loadIntegrationStatus();
    }
    if (activeTab === 'snippets' && api.activeProjectId) {
      loadSnippets();
    }
  }, [activeTab]);

  const loadSnippets = async () => {
    if (!api.activeProjectId) return;
    setSnippetsLoading(true);
    try {
      const data = await api.fetchSnippets();
      setSnippets(data || []);
    } catch(err) {
      toast.error("Failed to load snippets");
    } finally {
      setSnippetsLoading(false);
    }
  };

  const handleSaveSnippet = async () => {
    if (!snippetName.trim()) {
      toast.error('Snippet name is required');
      return;
    }
    if (!snippetBody.replace(/<[^>]*>?/gm, '').trim()) {
      toast.error('Snippet body is required');
      return;
    }

    setSnippetSaving(true);
    try {
      let finalName = snippetName.trim();
      let finalBody = snippetBody;
      const type = snippetModalType || 'standard';

      if (type === 'signature') {
        const slug = slugify(finalName);
        if (!slug) {
          toast.error('Signature name is invalid');
          return;
        }
        finalName = slug.startsWith('sig_') ? slug : `sig_${slug}`;
      } else {
        // For standard snippets, we strip HTML if any was pasted/inserted
        finalBody = finalBody.replace(/<[^>]*>?/gm, '');
      }

      const vars = extractVars(finalBody);
      if (editingSnippet) {
        await api.updateSnippet(editingSnippet.id, {
          name: finalName,
          body: finalBody,
          vars,
          type
        });
        toast.success('Updated');
      } else {
        await api.createSnippet({
          name: finalName,
          body: finalBody,
          vars,
          type
        });
        toast.success('Created');
      }
      setSnippetModalType(null);
      loadSnippets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save snippet');
    } finally {
      setSnippetSaving(false);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    if (!window.confirm('Delete this snippet?')) return;
    try {
      await api.deleteSnippet(id);
      toast.success('Snippet deleted');
      loadSnippets();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete snippet');
    }
  };

  // When the active project changes: clear ALL stale data immediately, then reload
  useEffect(() => {
    // Clear stale mailbox & domain data
    setMailboxes([]);
    setVerifiedDomains([]);
    // Clear stale integration data
    setHasHunter(false);
    setHasZb(false);
    setHasPdl(false);
    setHunterAccount(null);
    setZbCredits(null);
    setPdlUsage(null);

    if (!api.activeProjectId) return;
    // Reload whatever tab is currently active
    if (activeTab === 'mailboxes') loadMailboxes();
    if (activeTab === 'integrations') loadIntegrationStatus();
  }, [api.activeProjectId]);

  const loadIntegrationStatus = async () => {
    if (!api.activeProjectId) return;
    try {
      setFetchingHunter(true);
      setFetchingZb(true);
      setFetchingPdl(true);

      const settings = await api.fetchSettings();
      
      // Update Hunter
      setHasHunter(settings?.hunter?.connected || false);
      setHunterAccount(settings?.hunter?.connected ? settings.hunter : null);

      // Update ZeroBounce
      setHasZb(settings?.zerobounce?.connected || false);
      setZbCredits(settings?.zerobounce?.connected ? settings.zerobounce.credits : null);

      // Update PDL
      setHasPdl(settings?.pdl?.connected || false);

    } catch (err) {
      console.error('Failed to load integration status:', err);
      toast.error('Failed to load integration status.');
    } finally {
      setFetchingHunter(false);
      setFetchingZb(false);
      setFetchingPdl(false);
    }
  };

  const loadHunterStatus = async () => {
    try {
      const account = await api.fetchHunterAccount();
      setHunterAccount(account);
    } catch (err) {
      console.error('Failed to load Hunter status:', err);
      setHunterAccount(null);
    }
  };

  const loadZbStatus = async () => {
    try {
      const data = await api.fetchZeroBounceCredits();
      setZbCredits(data);
    } catch (err) {
      console.error('Failed to load ZeroBounce credits:', err);
      setZbCredits(null);
    }
  };

  const loadPdlStatus = async () => {
    if (!api.activeProjectId) return;
    try {
      // Assuming api.fetchPdlUsage exists or implementing a direct fetch
      // If api.fetchPdlUsage is not implemented, you might need to add it to useOutreachApi
      const data = await api.fetchPdlUsage(); // Assuming this returns usage data
      setPdlUsage(data);
    } catch (err) {
      console.error('Failed to load PDL usage:', err);
      setPdlUsage(null);
    }
  };

  const handleSaveIntegrationKeys = async (
    hunterKey: string | undefined,
    zbKey: string | undefined,
    pdlKey: string | undefined
  ) => {
    if (!api.activeProjectId) {
      toast.error('No project selected.');
      return;
    }
    setIsSaving(true);
    try {
      await api.updateSettings({
        hunter_api_key: hunterKey,
        zerobounce_api_key: zbKey,
        pdl_api_key: pdlKey
      });
      toast.success('Integration settings updated successfully');
      setHunterKeyInput('');
      setZbKeyInput('');
      setPdlKeyInput('');
      setShowHunterSetup(false);
      setShowZbSetup(false);
      setShowPdlSetup(false);
      await loadIntegrationStatus();
    } catch (err: any) {
      toast.error('Failed to save integration keys: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveHunterKey = async () => {
    setSavingHunter(true);
    await handleSaveIntegrationKeys(hunterKeyInput.trim() || undefined, undefined, undefined);
    setSavingHunter(false);
  };

  const handleSaveZbKey = async () => {
    setSavingZb(true);
    await handleSaveIntegrationKeys(undefined, zbKeyInput.trim() || undefined, undefined);
    setSavingZb(false);
  };

  const handleSavePdlKey = async () => {
    setSavingPdl(true);
    await handleSaveIntegrationKeys(undefined, undefined, pdlKeyInput.trim() || undefined);
    setSavingPdl(false);
  };

  const loadMailboxes = async () => {
    setMailboxesLoading(true);
    setDomainsLoading(true);
    try {
      const [mailboxData, domainData] = await Promise.all([
        api.fetchMailboxes(),
        api.fetchVerifiedDomains()
      ]);
      setMailboxes(mailboxData ?? []);
      setVerifiedDomains(domainData ?? []);
    } catch {
      // silently fail
    } finally {
      setMailboxesLoading(false);
      setDomainsLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    setConnectError(null);
    setConnectingGmail(true);
    try {
      await api.connectGmail();
      // connectGmail redirects so we won't reach here on success
    } catch (err: any) {
      setConnectError(err.message || 'Gmail connection failed.');
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleConnectSmtp = async () => {
    try {
      setConnectingGmail(true);
      await api.connectSmtp(smtpConfig);
      toast.success('Mailbox connected via SMTP/IMAP');
      setShowConnectModal(false);
      loadMailboxes();
    } catch (err: any) {
      toast.error(err.message || 'SMTP connection failed');
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setDisconnectingId(id);
    try {
      await api.disconnectMailbox(id);
      setMailboxes(prev => prev.filter(m => m.id !== id));
    } catch {
      // silently fail
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* Settings Sub-nav */}
      <div className="w-52 shrink-0 border-r border-white/5 bg-surface-dark/20 p-3 space-y-1">
        {SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
              activeTab === id
                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Settings Content */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-8 bg-background-dark">

        {/* ── MAILBOXES ── */}
        {activeTab === 'mailboxes' && (
          <div className="space-y-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Mailbox Settings</h2>
                <p className="text-sm text-slate-400 mt-1">Configure your domains and connected accounts</p>
              </div>
              <TealButton
                size="sm"
                className="shadow-lg shadow-teal-500/10"
                onClick={() => { setShowConnectModal(true); setConnectMode('picker'); }}
                disabled={!api.activeProjectId}
              >
                <Plus className="size-4" /> Add Mailbox
              </TealButton>
            </div>

            {/* ERROR ALERT */}
            {connectError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm">
                <AlertTriangle className="size-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-300">{connectError}</p>
              </div>
            )}

            {!api.activeProjectId ? (
              <OutreachEmptyState
                icon={<FolderOpen />}
                title="No project selected"
                description="Select a project to view and manage its connected mailboxes."
              />
            ) : (
              <>
                {/* 1. DOMAIN VERIFICATION (TOP) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-teal-400" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">DNS Ownership Verification</h3>
                  </div>
                  <DomainVerificationManager onStatusChange={loadMailboxes} />
                </section>

                {/* 2. DOMAIN MANAGEMENT (CARDS) */}
                <section className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Users2 className="w-5 h-5 text-teal-400" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Domain-Based Identity Management</h3>
                  </div>
                  
                  {domainsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                    </div>
                  ) : verifiedDomains.filter(d => d.status === 'verified').length === 0 ? (
                    <div className="p-8 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                      <Globe className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">No verified domains yet. Complete the verification above to start managing aliases.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6">
                      {verifiedDomains
                        .filter(d => d.status === 'verified')
                        .map((domain) => (
                          <DomainAliasCard 
                            key={domain.id} 
                            domain={domain} 
                            mailboxes={mailboxes}
                            onAliasAdded={loadMailboxes}
                          />
                        ))
                      }
                    </div>
                  )}
                </section>

                {/* 3. CONNECTED MAILBOXES (BOTTOM) */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-5 h-5 text-teal-400" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Connected Sending Engines</h3>
                  </div>

                  {mailboxesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                    </div>
                  ) : mailboxes.length === 0 ? (
                    <OutreachEmptyState
                      icon={<Mail />}
                      title="No mailboxes connected"
                      description="Connect your Gmail account or custom SMTP to start sending outreach emails."
                      action={<TealButton onClick={() => { setShowConnectModal(true); setConnectMode('picker'); }}><Plus className="size-4" /> Add Mailbox</TealButton>}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {mailboxes.map(mb => {
                        const score = mb.score ?? 100;
                        const scoreColor = score >= 85 ? 'teal' : score >= 70 ? 'yellow' : 'red';
                        const statusIcon = mb.status === 'healthy' || !mb.status
                          ? <CheckCircle2 className="size-4 text-teal-400" />
                          : mb.status === 'warning'
                          ? <AlertTriangle className="size-4 text-amber-400" />
                          : <XCircle className="size-4 text-red-400" />;

                        return (
                          <div key={mb.id} className="bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden hover:border-white/15 transition-all">
                            <div
                              className="flex items-center gap-4 p-5 cursor-pointer"
                              onClick={() => setExpandedMailbox(expandedMailbox === mb.id ? null : mb.id)}
                            >
                              <div className="size-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                                <span className="text-sm font-bold text-teal-400">{(mb.email || 'G')[0].toUpperCase()}</span>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2.5 mb-0.5">
                                  <p className="font-semibold text-white text-sm">{mb.email}</p>
                                  <OutreachBadge variant={scoreColor as any}>Health: {score}%</OutreachBadge>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  <span className="flex items-center gap-1.5 capitalize">
                                    {mb.connection_type === 'smtp' ? <Wifi className="size-3" /> : <Mail className="size-3" />}
                                    {mb.connection_type || 'gmail'}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Zap className="size-3" /> {mb.sent ?? 0}/{mb.dailyLimit ?? 200} today
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {statusIcon}
                                <ChevronDown className={cn('size-4 text-slate-500 transition-transform', expandedMailbox === mb.id && 'rotate-180')} />
                              </div>
                            </div>

                            <AnimatePresence>
                              {expandedMailbox === mb.id && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: 'auto' }}
                                  exit={{ height: 0 }}
                                  className="overflow-hidden border-t border-white/5"
                                >
                                  <div className="p-5 space-y-6">
                                    {/* Quota Bar */}
                                    <div>
                                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                                        <span>Daily Sending Quota</span>
                                        <span className="text-teal-400">{mb.sent ?? 0} / {mb.dailyLimit ?? 200} used</span>
                                      </div>
                                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-teal-500 rounded-full" 
                                          style={{ width: `${Math.min(100, ((mb.sent ?? 0) / (mb.dailyLimit ?? 200)) * 100)}%` }} 
                                        />
                                      </div>
                                    </div>

                                    {/* DNS Checks */}
                                    <div>
                                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-600 mb-3">Authentication Status</p>
                                      <div className="grid grid-cols-3 gap-3">
                                        {[
                                          { label: 'SPF',   pass: mb.spf ?? true },
                                          { label: 'DKIM',  pass: mb.dkim ?? true },
                                          { label: 'DMARC', pass: mb.dmarc ?? true },
                                        ].map(({ label, pass }) => (
                                          <div key={label} className={cn(
                                            'flex flex-col gap-1 p-3 rounded-xl border text-sm',
                                            pass
                                              ? 'bg-teal-500/5 border-teal-500/10 text-teal-400'
                                              : 'bg-red-500/5 border-red-500/10 text-red-400'
                                          )}>
                                            <div className="flex items-center justify-between">
                                              <span className="font-bold text-xs">{label}</span>
                                              {pass ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                                            </div>
                                            <span className="text-[10px] opacity-60 uppercase">{pass ? 'Verified' : 'Failing'}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="flex gap-2 pt-2 border-t border-white/5">
                                      <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all">
                                        <RefreshCw className="size-3.5" /> Re-check DNS
                                      </button>
                                      <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-all">
                                        <Search className="size-3.5" /> Run Spam Test
                                      </button>
                                      <button
                                        onClick={e => { e.stopPropagation(); handleDisconnect(mb.id); }}
                                        disabled={disconnectingId === mb.id}
                                        className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl transition-all ml-auto disabled:opacity-50"
                                      >
                                        {disconnectingId === mb.id ? 'Disconnecting…' : 'Disconnect Mailbox'}
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* ── WARMUP ── */}
        {activeTab === 'warmup' && (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-xl font-bold text-white">Email Warmup</h2>
              <p className="text-sm text-slate-400 mt-0.5">Gradually increase sending volume to establish sender reputation</p>
            </div>
            <div className="space-y-4">
              {mailboxes.filter(m => m.warmupActive).map(mb => (
                <div key={mb.id} className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                        <Thermometer className="size-4 text-teal-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{mb.email}</p>
                        <p className="text-xs text-slate-500">Day 14 of 30-day warmup plan</p>
                      </div>
                    </div>
                    <OutreachBadge variant="teal" dot>Active</OutreachBadge>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Warm-up progress</span>
                        <span className="text-teal-400 font-bold">47%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full">
                        <div className="h-full w-[47%] bg-gradient-to-r from-teal-600 to-teal-400 rounded-full" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'Current/Day', value: '24' },
                        { label: 'Target/Day', value: '100' },
                        { label: 'Delivery Rate', value: '98.7%' },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-black/20 rounded-xl p-3">
                          <p className="text-lg font-bold text-teal-400">{value}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <div className="p-4 rounded-2xl border border-dashed border-white/10 text-center text-sm text-slate-500 hover:border-teal-500/20 hover:text-teal-400 transition-all cursor-pointer">
                <Thermometer className="size-6 mx-auto mb-2 opacity-40" />
                Enable warmup for another mailbox
              </div>
            </div>
          </div>
        )}

        {/* ── SNIPPETS ── */}
        {activeTab === 'snippets' && (
          <div className="space-y-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            
            {/* ── STANDARD SNIPPETS ── */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Standard Snippets</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Plain-text reusable blocks for your emails</p>
                </div>
                <TealButton 
                  size="sm" 
                  onClick={() => {
                    setEditingSnippet(null);
                    setSnippetName('');
                    setSnippetBody('');
                    setSnippetModalType('standard');
                  }}
                  disabled={!api.activeProjectId}
                >
                  <Plus className="size-4" /> New Snippet
                </TealButton>
              </div>
              
              {!api.activeProjectId ? (
                <OutreachEmptyState icon={<Code2 />} title="No project selected" description="Select a project to manage snippets." />
              ) : snippetsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-teal-500 animate-spin" /></div>
              ) : standardSnippets.length === 0 ? (
                <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center">
                  <p className="text-sm text-slate-500 italic">No standard snippets found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {standardSnippets.map(snippet => (
                    <div key={snippet.id} className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 group hover:border-white/15 transition-colors flex flex-col">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                           <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 border border-white/10 text-slate-400 uppercase tracking-tighter">Plain Text</span>
                           <h3 className="font-semibold text-white text-sm">{snippet.name}</h3>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingSnippet(snippet);
                              setSnippetName(snippet.name);
                              setSnippetBody(snippet.body);
                              setSnippetModalType('standard');
                            }}
                            className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Edit Snippet"
                          >
                            <Pencil className="size-3.5" />
                            <span className="text-[10px] font-bold uppercase">Edit</span>
                          </button>
                          <button onClick={() => handleDeleteSnippet(snippet.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                            <XCircle className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-slate-400 leading-relaxed mb-3 bg-black/20 rounded-lg px-4 py-3 flex-1 overflow-y-auto max-h-32 custom-scrollbar font-mono whitespace-pre-wrap">
                        {snippet.body}
                      </div>
                      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                        <p className="text-[10px] text-slate-600 uppercase tracking-wider shrink-0">Tag:</p>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 border border-teal-500/20 text-teal-400">{`{{${snippet.name}}}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* ── EMAIL SIGNATURES ── */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Email Signatures</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Rich-text signatures with HTML support</p>
                </div>
                <TealButton 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    setEditingSnippet(null);
                    setSnippetName('');
                    setSnippetBody('');
                    setSnippetModalType('signature');
                  }}
                  disabled={!api.activeProjectId}
                >
                  <Plus className="size-4" /> Create Signature
                </TealButton>
              </div>
              
              {api.activeProjectId && !snippetsLoading && signatureSnippets.length === 0 ? (
                <div className="p-8 border border-dashed border-white/10 rounded-2xl text-center bg-teal-500/[0.02]">
                  <p className="text-sm text-slate-500 italic">No signatures created yet. Create one to use in your sequences.</p>
                </div>
              ) : signatureSnippets.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {signatureSnippets.map(snippet => (
                    <div key={snippet.id} className="bg-teal-500/[0.03] border border-teal-500/10 rounded-2xl p-5 group hover:border-teal-500/20 transition-colors flex flex-col">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                           <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 border border-teal-500/30 text-teal-400 uppercase tracking-tighter">Signature</span>
                           <h3 className="font-semibold text-white text-sm">{snippet.name}</h3>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              setEditingSnippet(snippet);
                              setSnippetName(snippet.name.replace(/^sig_/, ''));
                              setSnippetBody(snippet.body);
                              setSnippetModalType('signature');
                            }}
                            className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Edit Signature"
                          >
                            <Pencil className="size-3.5" />
                            <span className="text-[10px] font-bold uppercase">Edit</span>
                          </button>
                          <button onClick={() => handleDeleteSnippet(snippet.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors">
                            <XCircle className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-slate-300 leading-relaxed mb-3 bg-black/40 rounded-lg px-4 py-3 flex-1 overflow-y-auto max-h-32 custom-scrollbar ProseMirror" 
                           dangerouslySetInnerHTML={{ __html: snippet.body }} />
                      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                        <p className="text-[10px] text-slate-600 uppercase tracking-wider shrink-0">Snippet Tag:</p>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 border border-teal-500/20 text-teal-400">{`{{${snippet.name}}}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── API & WEBHOOKS ── */}
        {activeTab === 'api' && (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-xl font-bold text-white">API & Webhooks</h2>
              <p className="text-sm text-slate-400 mt-0.5">Integrate Outreach into your own tools and workflows</p>
            </div>

            {/* API Key */}
            <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Key className="size-4 text-teal-400" />
                <p className="font-semibold text-white">API Key</p>
              </div>
              <div className="flex items-center gap-3">
                <code className="flex-1 font-mono text-xs bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-slate-300 truncate">
                  {showApiKey ? MOCK_API_KEY : '•'.repeat(48)}
                </code>
                <button onClick={() => setShowApiKey(!showApiKey)} className="p-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <button className="p-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                  <Copy className="size-4" />
                </button>
              </div>
              <p className="text-xs text-amber-400 flex items-center gap-2">
                <AlertTriangle className="size-3.5" /> Keep this secret — treat it like a password
              </p>
            </div>

            {/* Webhook Endpoints */}
            <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Webhook className="size-4 text-teal-400" />
                  <p className="font-semibold text-white">Webhook Endpoints</p>
                </div>
                <TealButton size="sm"><Plus className="size-4" /> Add Endpoint</TealButton>
              </div>
              <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-sm text-slate-500">
                No webhook endpoints configured yet.<br />
                <span className="text-teal-400 cursor-pointer hover:underline">Add your first endpoint</span> to receive events.
              </div>
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-xl font-bold text-white">Notifications</h2>
              <p className="text-sm text-slate-400 mt-0.5">Control when and how you get alerted</p>
            </div>
            <div className="space-y-3">
              {[
                { key: 'replyReceived', label: 'Reply received', sub: 'Get notified whenever a lead responds' },
                { key: 'hotLead',       label: 'Hot lead detected', sub: 'AI flagged INTERESTED or MEETING_REQUEST intent' },
                { key: 'bounce',        label: 'Email bounced', sub: 'Hard bounce or delivery failure detected' },
                { key: 'browserEnabled', label: 'Browser notifications', sub: 'Show native browser push notifications' },
                { key: 'slackEnabled',  label: 'Slack alerts', sub: 'Send alerts to a Slack channel' },
              ].map(({ key, label, sub }) => {
                const isOn = notifications[key as keyof typeof notifications];
                return (
                  <div key={key} className="flex items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/8 rounded-2xl">
                    <div>
                      <p className="font-semibold text-white text-sm">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                    </div>
                    <button
                      onClick={() => setNotifications(prev => ({ ...prev, [key]: !isOn }))}
                      className={cn(
                        'w-12 h-6 rounded-full border transition-all relative',
                        isOn ? 'bg-teal-500 border-teal-400' : 'bg-white/10 border-white/10'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                        isOn ? 'left-6' : 'left-0.5'
                      )} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INTEGRATIONS ── */}
        {activeTab === 'integrations' && (
          <div className="space-y-6 w-full">
            <div>
              <h2 className="text-xl font-bold text-white">Integrations</h2>
              <p className="text-sm text-slate-400 mt-0.5">Connect third-party tools to power Outreach</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Hunter.io Custom Card */}
              <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-teal-400">H</span>
                  </div>
                   {fetchingHunter ? (
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                  ) : has_hunter ? (
                    null // Removed "Connected" badge as requested
                  ) : (
                    <TealButton size="sm" variant="outline" onClick={() => setShowHunterSetup(!showHunterSetup)}>
                      Connect
                    </TealButton>
                  )}
                </div>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-white text-sm">Hunter.io</p>
                  {has_hunter && (
                    <button onClick={() => setShowHunterSetup(!showHunterSetup)} className="text-[10px] text-slate-500 hover:text-white uppercase tracking-wider font-bold">
                      Config
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/60 mb-1">Email Finder</p>
                <p className="text-xs text-slate-500 mb-4">Find professional email addresses by domain</p>

                <AnimatePresence>
                  {showHunterSetup && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-3 mt-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Hunter.io API Key</label>
                          <input 
                            type="password" 
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" 
                            placeholder="Data is encrypted at rest"
                            value={hunterKeyInput}
                            onChange={(e) => setHunterKeyInput(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <TealButton 
                            size="sm" 
                            className="w-full" 
                            disabled={!hunterKeyInput.trim()} 
                            onClick={handleSaveHunterKey}
                            loading={savingHunter}
                          >
                            Save API Key
                          </TealButton>
                          {has_hunter && (
                            <button className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all border border-red-500/10"
                             onClick={async () => {
                               await api.updateSettings({ hunter_api_key: '' });
                               setHasHunter(false);
                               setHunterAccount(null);
                               toast.success('Hunter.io disconnected');
                             }}
                            >Disconnect</button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {has_hunter && hunterAccount && !showHunterSetup && (
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                    <div className="flex justify-between items-center bg-teal-500/5 border border-teal-500/10 rounded-xl p-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Usage</span>
                      <span className="text-[10px] font-semibold text-slate-400">{hunterAccount.plan_name} Plan</span>
                    </div>

                    {/* Searches Usage */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400 font-medium">Search Credits</span>
                        <span className="text-teal-400 font-bold">
                          {(hunterAccount.searches?.used ?? 0).toLocaleString()} used / {(hunterAccount.searches?.total ?? 0).toLocaleString()} limit
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${Math.min(100, ((hunterAccount.searches?.used ?? 0) / (hunterAccount.searches?.total ?? 1)) * 100)}%` 
                          }} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{(hunterAccount.searches?.remaining ?? 0).toLocaleString()} credits remaining</span>
                        {hunterAccount.reset_date && <span>Renews on: {hunterAccount.reset_date}</span>}
                      </div>
                    </div>

                    {/* Verifications Usage */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400 font-medium">Verification Credits</span>
                        <span className="text-teal-400 font-bold">
                          {(hunterAccount.verifications?.used ?? 0).toLocaleString()} used / {(hunterAccount.verifications?.total ?? 0).toLocaleString()} limit
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${Math.min(100, ((hunterAccount.verifications?.used ?? 0) / (hunterAccount.verifications?.total ?? 1)) * 100)}%` 
                          }} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>{(hunterAccount.verifications?.remaining ?? 0).toLocaleString()} credits remaining</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ZeroBounce Custom Card */}
              <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-teal-400">Z</span>
                  </div>
                  {fetchingZb ? (
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                  ) : has_zerobounce ? (
                    <OutreachBadge variant="teal" dot>Connected</OutreachBadge>
                  ) : (
                    <TealButton size="sm" variant="outline" onClick={() => setShowZbSetup(!showZbSetup)}>
                      Connect
                    </TealButton>
                  )}
                </div>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-white text-sm">ZeroBounce</p>
                  {has_zerobounce && (
                    <button onClick={() => setShowZbSetup(!showZbSetup)} className="text-[10px] text-slate-500 hover:text-white uppercase tracking-wider font-bold">
                      Config
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/60 mb-1">Email Validation</p>
                <p className="text-xs text-slate-500 mb-4">Validate and clean email lists</p>

                <AnimatePresence>
                  {showZbSetup && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-3 mt-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-400 mb-1.5 block">ZeroBounce API Key</label>
                          <input 
                            type="password" 
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" 
                            placeholder="Data is encrypted at rest"
                            value={zbKeyInput}
                            onChange={(e) => setZbKeyInput(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <TealButton 
                            size="sm" 
                            className="w-full" 
                            disabled={!zbKeyInput.trim()} 
                            onClick={handleSaveZbKey}
                            loading={savingZb}
                          >
                            Save API Key
                          </TealButton>
                          {has_zerobounce && (
                            <button className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all border border-red-500/10"
                             onClick={async () => {
                               await api.updateSettings({ zerobounce_api_key: '' });
                               setHasZb(false);
                               setZbCredits(null);
                               toast.success('ZeroBounce disconnected');
                             }}
                            >Disconnect</button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {has_zerobounce && zbCredits && !showZbSetup && (
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Total Credits</span>
                      <span className="font-semibold text-white">
                        {(zbCredits ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-teal-500/5 border border-teal-500/10 rounded-xl">
                      <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mb-1">Waterfall Mode</p>
                      <p className="text-xs text-teal-400/80">Primary verification provider. Falls back to Hunter if out of credits.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* PDL Custom Card */}
              <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-teal-400">P</span>
                  </div>
                  {fetchingPdl ? (
                    <Loader2 className="size-4 animate-spin text-slate-400" />
                  ) : has_pdl ? (
                    <OutreachBadge variant="teal" dot>Connected</OutreachBadge>
                  ) : (
                    <TealButton size="sm" variant="outline" onClick={() => setShowPdlSetup(!showPdlSetup)}>
                      Connect
                    </TealButton>
                  )}
                </div>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-white text-sm">PeopleDataLabs</p>
                  {has_pdl && (
                    <button onClick={() => setShowPdlSetup(!showPdlSetup)} className="text-[10px] text-slate-500 hover:text-white uppercase tracking-wider font-bold">
                      Config
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/60 mb-1">Contact Enrichment</p>
                <p className="text-xs text-slate-500 mb-4">Enrich leads with B2B data & socials</p>

                <AnimatePresence>
                  {showPdlSetup && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-3 mt-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-400 mb-1.5 block">PDL API Key</label>
                          <input 
                            type="password" 
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50" 
                            placeholder="Data is encrypted at rest"
                            value={pdlKeyInput}
                            onChange={(e) => setPdlKeyInput(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <TealButton 
                            size="sm" 
                            className="w-full" 
                            disabled={!pdlKeyInput.trim()} 
                            onClick={handleSavePdlKey}
                            loading={savingPdl}
                          >
                            Save API Key
                          </TealButton>
                          {has_pdl && (
                            <button className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all border border-red-500/10"
                             onClick={async () => {
                               await api.updateSettings({ pdl_api_key: '' });
                               setHasPdl(false);
                               setPdlUsage(null);
                               toast.success('PDL disconnected');
                             }}
                            >Disconnect</button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {has_pdl && pdlUsage && !showPdlSetup && (
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Remaining</span>
                      <span className="font-semibold text-white">{(pdlUsage?.remaining ?? 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Usage</span>
                        <span className="text-teal-400 font-bold">{(pdlUsage?.used ?? 0).toLocaleString()} / {(pdlUsage?.available ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${((pdlUsage?.used ?? 0) / (pdlUsage?.available ?? 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Other Built-in Integrations (Mocked) */}
              {[
                { name: 'Mail-Tester',  cat: 'Spam Testing',        status: 'connect',  desc: 'Score your spam rating' },
                { name: 'MXToolbox',    cat: 'Blocklist Monitor',   status: 'connected', desc: 'Monitor IP/domain blocklists' },
                { name: 'SendGrid',     cat: 'SMTP Relay',          status: 'connect',  desc: 'Dedicated sending infrastructure' },
              ].map(({ name, cat, status, desc }) => (
                <div key={name} className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <span className="text-lg font-bold text-white">{name[0]}</span>
                    </div>
                    {status === 'connected'
                      ? <OutreachBadge variant="teal" dot>Connected</OutreachBadge>
                      : <TealButton size="sm" variant="outline">Connect</TealButton>
                    }
                  </div>
                  <p className="font-semibold text-white text-sm mb-0.5">{name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/60 mb-1">{cat}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── CONNECTION MODAL ── */}
      <AnimatePresence>
        {showConnectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConnectModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-surface-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                {connectMode === 'picker' ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-white">Connect Mailbox</h3>
                      <p className="text-slate-400 mt-2">Choose your preferred email provider</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <button
                        onClick={handleConnectGmail}
                        disabled={connectingGmail}
                        className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-teal-500/30 transition-all group"
                      >
                        <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg" className="size-6" alt="Gmail" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-white">Google Gmail / GSuite</p>
                          <p className="text-xs text-slate-500">Connect via secure OAuth consent</p>
                        </div>
                      </button>

                      <button
                        onClick={() => setConnectMode('smtp')}
                        className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-teal-500/30 transition-all group"
                      >
                        <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform text-white">
                          <Wifi className="size-6" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-white">Custom SMTP / IMAP</p>
                          <p className="text-xs text-slate-500">Outlook, Zoho, or private servers</p>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold text-white">SMTP Configuration</h3>
                      <button onClick={() => setConnectMode('picker')} className="text-xs text-slate-500 hover:text-white font-bold uppercase tracking-wider">Back</button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block">Settings</label>
                        <div className="space-y-3">
                          <input 
                            type="email" 
                            placeholder="Email Address" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.email}
                            onChange={e => setSmtpConfig({...smtpConfig, email: e.target.value})}
                          />
                          <input 
                            type="text" 
                            placeholder="Sender Name (e.g. John Doe)" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.name}
                            onChange={e => setSmtpConfig({...smtpConfig, name: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block">SMTP Host</label>
                        <input 
                          type="text" 
                          placeholder="smtp.example.com"
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                          value={smtpConfig.smtp_host}
                          onChange={e => setSmtpConfig({...smtpConfig, smtp_host: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block">SMTP Port</label>
                        <input 
                          type="number" 
                          placeholder="587"
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                          value={smtpConfig.smtp_port}
                          onChange={e => setSmtpConfig({...smtpConfig, smtp_port: parseInt(e.target.value)})}
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block">SMTP Auth</label>
                        <div className="grid grid-cols-2 gap-3">
                          <input 
                            type="text" 
                            placeholder="Username" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.smtp_user}
                            onChange={e => setSmtpConfig({...smtpConfig, smtp_user: e.target.value})}
                          />
                          <input 
                            type="password" 
                            placeholder="Password" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.smtp_pass}
                            onChange={e => setSmtpConfig({...smtpConfig, smtp_pass: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="col-span-2 border-t border-white/5 pt-4">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 block">IMAP (for reply detection)</label>
                        <div className="grid grid-cols-2 gap-3">
                          <input 
                            type="text" 
                            placeholder="imap.example.com" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.imap_host}
                            onChange={e => setSmtpConfig({...smtpConfig, imap_host: e.target.value})}
                          />
                          <input 
                            type="number" 
                            placeholder="993" 
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                            value={smtpConfig.imap_port}
                            onChange={e => setSmtpConfig({...smtpConfig, imap_port: parseInt(e.target.value)})}
                          />
                        </div>
                      </div>
                    </div>

                    <TealButton 
                      className="w-full py-4 text-md" 
                      onClick={handleConnectSmtp}
                      loading={connectingGmail}
                    >
                      Verify & Connect
                    </TealButton>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
        {/* SNIPPET MODAL */}
        {snippetModalType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSnippetModalType(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0d1117]">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {editingSnippet ? `Edit ${snippetModalType === 'signature' ? 'Signature' : 'Snippet'}` : `Create ${snippetModalType === 'signature' ? 'Signature' : 'Snippet'}`}
                  </h2>
                </div>
                <button 
                  onClick={() => setSnippetModalType(null)}
                  className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <XCircle className="size-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1 bg-[#0d1117]">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                    {snippetModalType === 'signature' ? 'Signature Name' : 'Snippet Name / Tag'}
                  </label>
                  <input 
                    type="text" 
                    placeholder={snippetModalType === 'signature' ? "e.g. Founder" : "e.g. Value Props"}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 focus:outline-none"
                    value={snippetName}
                    onChange={(e) => setSnippetName(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    {snippetModalType === 'signature' 
                      ? "This will automatically generate tag {{sig_" + slugify(snippetName || 'name') + "}}"
                      : "A short name. Will be used as tag {{name}}."}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Content</label>
                  {snippetModalType === 'signature' ? (
                    <TipTapEditor 
                      value={snippetBody} 
                      onChange={setSnippetBody} 
                      placeholder="Enter your rich text signature here..."
                      className="min-h-[250px]"
                    />
                  ) : (
                    <textarea
                      value={snippetBody}
                      onChange={(e) => setSnippetBody(e.target.value)}
                      placeholder="Enter plain text snippet..."
                      className="w-full h-48 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-teal-500/50 focus:outline-none resize-none font-mono"
                    />
                  )}
                  
                  <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 mt-3">
                    <div className="flex items-start gap-2">
                       <Zap className="size-4 text-teal-400 shrink-0 mt-0.5" />
                       <div className="text-xs text-teal-300">
                         <strong>Auto Extractor enabled:</strong> Variables like <code className="bg-black/30 px-1 rounded mx-1">{'{{first_name}}'}</code> are automatically detected.
                       </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-white/5 bg-[#0d1117] shrink-0">
                <TealButton 
                  className="w-full py-4 text-md" 
                  onClick={handleSaveSnippet}
                  loading={snippetSaving}
                >
                  {editingSnippet ? 'Save Changes' : 'Create'}
                </TealButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
