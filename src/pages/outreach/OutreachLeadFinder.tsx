import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, User, ShieldCheck, Loader2, Save, 
  CheckCircle2, AlertCircle, Globe, PlugZap, Settings as SettingsIcon,
  Search
} from 'lucide-react';
import { TealButton, OutreachBadge } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';

export default function OutreachLeadFinder() {
  const api = useOutreachApi();
  const [activeTab, setActiveTab] = useState<'domain' | 'finder' | 'verifier'>('domain');
  
  // Connection Guard State
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [hasConnection, setHasConnection] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Domain Search
  const [domain, setDomain] = useState('');
  const [domainResults, setDomainResults] = useState<any>(null);

  // Email Finder
  const [finderFname, setFinderFname] = useState('');
  const [finderLname, setFinderLname] = useState('');
  const [finderDomain, setFinderDomain] = useState('');
  const [finderResult, setFinderResult] = useState<any>(null);

  // Email Verifier
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyResult, setVerifyResult] = useState<any>(null);

  useEffect(() => {
    checkConnection();
  }, [api.activeProjectId]);

  const checkConnection = async () => {
    try {
      setIsCheckingConnection(true);
      const settings = await api.fetchSettings();
      setHasConnection(!!settings?.hasHunterKey);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setHasConnection(false);
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleApiError = (err: any) => {
    if (err.message?.includes('429')) {
      setErrorMsg('Rate limited. Please wait a moment and try again.');
    } else if (err.message?.includes('401') || err.message?.includes('403')) {
      setErrorMsg('No credits or invalid API key. Please check your Hunter.io settings.');
    } else {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    }
  };

  const doDomainSearch = async () => {
    if (!domain) return;
    setLoading(true); setErrorMsg(null); setDomainResults(null);
    try {
      const res = await api.hunterDomainSearch(domain, { limit: 20 });
      setDomainResults(res.data);
    } catch (e: any) {
      handleApiError(e);
    } finally {
      setLoading(false);
    }
  };

  const doEmailFinder = async () => {
    if (!finderFname || !finderLname || !finderDomain) return;
    setLoading(true); setErrorMsg(null); setFinderResult(null);
    try {
      const res = await api.hunterEmailFinder(finderDomain, finderFname, finderLname);
      setFinderResult(res.data);
    } catch (e: any) {
      handleApiError(e);
    } finally {
      setLoading(false);
    }
  };

  const doEmailVerifier = async () => {
    if (!verifyEmail) return;
    setLoading(true); setErrorMsg(null); setVerifyResult(null);
    try {
      const res = await api.hunterEmailVerifier(verifyEmail);
      setVerifyResult(res.data);
    } catch (e: any) {
      handleApiError(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToContacts = async (emailData: any, type: 'domain' | 'finder') => {
    try {
      setLoading(true);
      const contactPayload = {
        first_name: emailData.first_name || '',
        last_name: emailData.last_name || '',
        email: emailData.value || emailData.email,
        company: type === 'domain' ? domainResults?.organization : finderDomain,
        status: 'not_enrolled',
        source_detail: 'hunter',
        confidence_score: emailData.confidence || emailData.score,
        verification_status: emailData.verification?.status || 'unverified',
      };
      await api.createContact(contactPayload);
      toast.success('Saved to contacts!');
    } catch (e: any) {
      toast.error('Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  const goToSettings = () => {
    window.dispatchEvent(new CustomEvent('outreach-tab-change', { detail: 'settings' }));
  };

  if (isCheckingConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 className="size-8 animate-spin text-teal-400 mb-4" />
        <p className="text-sm font-medium">Verifying Hunter.io connection...</p>
      </div>
    );
  }

  if (!hasConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto">
        <div className="size-20 bg-teal-500/10 rounded-3xl border border-teal-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(20,184,166,0.15)]">
          <PlugZap className="size-10 text-teal-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Connect Hunter.io to find leads</h2>
        <p className="text-slate-400 mb-8 leading-relaxed">
          Supercharge your outreach by connecting your Hunter.io API key for domain search, email finding, and verification. 
          Start building your target list with high-confidence data in seconds.
        </p>
        <TealButton onClick={goToSettings} className="px-8 py-3 rounded-2xl flex items-center gap-3 group shadow-lg shadow-teal-500/10">
          <SettingsIcon className="size-5 group-hover:rotate-90 transition-transform duration-500" />
          Go to Outreach Settings
        </TealButton>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Sub-Tabs */}
      <div className="shrink-0 flex items-center gap-8 px-8 border-b border-white/5 bg-[#0d1117] sticky top-0 z-10">
        {[
          { id: 'domain', label: 'Domain Search', icon: Building2 },
          { id: 'finder', label: 'Email Finder', icon: User },
          { id: 'verifier', label: 'Verifier', icon: ShieldCheck },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id as any); setErrorMsg(null); }}
            className={`flex items-center gap-2.5 pb-4 pt-6 px-1 border-b-2 font-bold text-sm transition-all duration-300 ${
              activeTab === id 
                ? 'border-teal-400 text-teal-400' 
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon className={`size-4 transition-transform duration-300 ${activeTab === id ? 'scale-110' : ''}`} />
            {label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0d1117]">
        <div className="max-w-4xl mx-auto">
          {/* Error Banner */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-6">
                <div className="px-6 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="size-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200 font-medium">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DOMAIN SEARCH */}
          {activeTab === 'domain' && (
            <div className="space-y-8">
              <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[2rem] shadow-xl">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <Building2 className="size-5 text-teal-400" />
                  Search by Domain
                </h3>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 group">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                    <input 
                      value={domain} onChange={(e) => setDomain(e.target.value)}
                      placeholder="e.g. acmecorp.com"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && doDomainSearch()}
                    />
                  </div>
                  <TealButton onClick={doDomainSearch} disabled={loading || !domain} className="px-8 h-[52px] rounded-2xl">
                    {loading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
                  </TealButton>
                </div>
              </div>

              {domainResults && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex justify-between items-end px-4">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-1 tracking-tight">{domainResults.organization || domain}</h3>
                      <p className="text-sm text-slate-400 font-medium">{domainResults.emails?.length || 0} Professional contacts found</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {domainResults.emails?.map((e: any, idx: number) => (
                      <div key={idx} className="group p-6 bg-white/[0.03] border border-white/5 hover:border-teal-500/30 rounded-[1.5rem] flex items-start justify-between transition-all hover:bg-white/[0.05] hover:shadow-2xl hover:shadow-teal-500/5">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="font-bold text-white flex items-center gap-2 text-base">
                              {e.first_name} {e.last_name} 
                              {e.verification?.status === 'valid' && <CheckCircle2 className="size-4 text-green-400" />}
                            </p>
                            <p className="text-sm text-teal-400 font-semibold">{e.value}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {e.position && <OutreachBadge variant="gray" className="text-[10px] uppercase font-bold tracking-wider">{e.position}</OutreachBadge>}
                            <OutreachBadge variant="teal" className="text-[10px] uppercase font-bold tracking-wider">{e.confidence}% Score</OutreachBadge>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleSaveToContacts(e, 'domain')} 
                          disabled={loading}
                          className="p-3 bg-white/5 hover:bg-teal-500/20 text-slate-400 hover:text-teal-400 rounded-xl transition-all border border-transparent hover:border-teal-500/30"
                        >
                          <Save className="size-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EMAIL FINDER */}
          {activeTab === 'finder' && (
            <div className="space-y-8">
              <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[2rem] shadow-xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <User className="size-5 text-teal-400" />
                  Find Specific Contact
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block ml-1">First Name</label>
                    <input 
                      value={finderFname} onChange={(e) => setFinderFname(e.target.value)}
                      placeholder="e.g. Elon"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block ml-1">Last Name</label>
                    <input 
                      value={finderLname} onChange={(e) => setFinderLname(e.target.value)}
                      placeholder="e.g. Musk"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block ml-1">Company Domain</label>
                    <input 
                      value={finderDomain} onChange={(e) => setFinderDomain(e.target.value)}
                      placeholder="e.g. spacex.com"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all"
                    />
                  </div>
                </div>
                <TealButton className="w-full py-4 rounded-2xl text-base h-auto font-bold shadow-lg shadow-teal-500/10" onClick={doEmailFinder} disabled={loading || !finderFname || !finderLname || !finderDomain}>
                  {loading ? <Loader2 className="size-5 animate-spin mx-auto" /> : 'Find Email Address'}
                </TealButton>
              </div>

              {finderResult && (
                <div className="p-8 bg-teal-500/[0.03] border border-teal-500/20 rounded-[2rem] flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-2xl font-bold text-white mb-1 tracking-tight">{finderResult.first_name} {finderResult.last_name}</h4>
                      <p className="text-xl text-teal-400 font-bold tracking-tight">{finderResult.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <OutreachBadge variant="teal" className="px-3 py-1 font-bold">{finderResult.score}% Confidence</OutreachBadge>
                      {finderResult.verification?.status && (
                         <OutreachBadge variant={finderResult.verification.status === 'valid' ? 'green' : 'gray'} className="px-3 py-1 font-bold uppercase">
                           {finderResult.verification.status}
                         </OutreachBadge>
                      )}
                    </div>
                  </div>
                  <TealButton size="lg" className="px-8 rounded-2xl gap-3 h-auto py-4 font-bold" onClick={() => handleSaveToContacts(finderResult, 'finder')} disabled={loading}>
                    <Save className="size-5" /> Save Contact
                  </TealButton>
                </div>
              )}
            </div>
          )}

          {/* EMAIL VERIFIER */}
          {activeTab === 'verifier' && (
            <div className="space-y-8">
              <div className="bg-white/[0.03] border border-white/5 p-8 rounded-[2rem] shadow-xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <ShieldCheck className="size-5 text-teal-400" />
                  Verify Email Authenticity
                </h3>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                    <input 
                      value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)}
                      placeholder="e.g. contact@domain.com"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-4 focus:ring-teal-500/5 transition-all"
                      onKeyDown={(e) => e.key === 'Enter' && doEmailVerifier()}
                    />
                  </div>
                  <TealButton onClick={doEmailVerifier} disabled={loading || !verifyEmail} className="px-8 h-[52px] rounded-2xl font-bold">
                    {loading ? <Loader2 className="size-5 animate-spin" /> : 'Run Check'}
                  </TealButton>
                </div>
              </div>

              {verifyResult && (
                <div className={`p-8 border rounded-[2rem] animate-in fade-in slide-in-from-bottom-4 duration-500 ${verifyResult.status === 'valid' ? 'bg-green-500/[0.03] border-green-500/20 shadow-xl shadow-green-500/5' : verifyResult.status === 'invalid' ? 'bg-red-500/[0.03] border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h4 className="text-xl font-bold text-white mb-1 tracking-tight">{verifyResult.email}</h4>
                      <p className="text-sm text-slate-400 font-medium">Verification Audit Report</p>
                    </div>
                    <OutreachBadge variant={verifyResult.status === 'valid' ? 'green' : verifyResult.status === 'invalid' ? 'red' : 'yellow'} className="px-5 py-2 text-xs font-black tracking-widest uppercase">
                      {verifyResult.status}
                    </OutreachBadge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-slate-500 block text-[10px] font-black uppercase tracking-widest mb-1">Confidence</span>
                      <span className="text-white text-xl font-bold">{verifyResult.score}%</span>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-slate-500 block text-[10px] font-black uppercase tracking-widest mb-1">Structure</span>
                      <span className="text-white text-xl font-bold">{verifyResult.format ? 'Valid' : 'Invalid'}</span>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-slate-500 block text-[10px] font-black uppercase tracking-widest mb-1">SMTP Ping</span>
                      <span className="text-white text-xl font-bold">{verifyResult.smtp_check ? 'Active' : 'Missing'}</span>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-slate-500 block text-[10px] font-black uppercase tracking-widest mb-1">Role Type</span>
                      <span className="text-white text-xl font-bold">{verifyResult.regexp ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
