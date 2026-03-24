import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Building2, User, Mail, ShieldCheck, Loader2, Save, HardDrive, CheckCircle2, AlertCircle, Globe } from 'lucide-react';
import { TealButton, OutreachBadge } from '../OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';

interface LeadFinderPanelProps {
  onClose: () => void;
  onSaveContact: (contact: any) => Promise<void>;
}

export default function LeadFinderPanel({ onClose, onSaveContact }: LeadFinderPanelProps) {
  const api = useOutreachApi();
  const [activeTab, setActiveTab] = useState<'domain' | 'finder' | 'verifier' | 'saved'>('domain');
  
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

  // Saved Leads
  const [savedLeads, setSavedLeads] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'saved') {
      loadSavedLeads();
    }
  }, [activeTab]);

  const loadSavedLeads = async () => {
    try {
      setLoading(true);
      const contacts = await api.fetchContacts() || [];
      const hunterLeads = contacts.filter((c: any) => c.source_detail === 'hunter');
      setSavedLeads(hunterLeads);
    } catch {
      // ignore
    } finally {
      setLoading(false);
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
      await onSaveContact(contactPayload);
      toast.success('Saved to contacts!');
    } catch (e: any) {
      toast.error('Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl h-full bg-[#111111] border-l border-white/10 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Search className="size-5 text-teal-400" />
                <h2 className="text-xl font-bold text-white">Lead Finder</h2>
              </div>
              <p className="text-sm text-slate-400">Powered by Hunter.io Integrations</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Error Banner */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20 flex items-start gap-3">
                  <AlertCircle className="size-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-200">{errorMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-6 px-6 pt-4 border-b border-white/5">
            {[
              { id: 'domain', label: 'Domain Search', icon: Building2 },
              { id: 'finder', label: 'Email Finder', icon: User },
              { id: 'verifier', label: 'Verifier', icon: ShieldCheck },
              { id: 'saved', label: 'Saved Leads', icon: HardDrive },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setActiveTab(id as any); setErrorMsg(null); }}
                className={`flex items-center gap-2 pb-3 px-1 border-b-2 font-semibold text-sm transition-colors ${
                  activeTab === id 
                    ? 'border-teal-400 text-teal-400' 
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            
            {/* DOMAIN SEARCH */}
            {activeTab === 'domain' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-white block">Domain to Search</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                      <input 
                        value={domain} onChange={(e) => setDomain(e.target.value)}
                        placeholder="e.g. acmecorp.com"
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/50"
                      />
                    </div>
                    <TealButton onClick={doDomainSearch} disabled={loading || !domain}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : 'Search'}
                    </TealButton>
                  </div>
                </div>

                {domainResults && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">{domainResults.organization || domain}</h3>
                        <p className="text-sm text-slate-400">{domainResults.emails?.length || 0} emails found</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {domainResults.emails?.map((e: any, idx: number) => (
                        <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-white flex items-center gap-2">
                              {e.first_name} {e.last_name} 
                              {e.verification?.status === 'valid' && <CheckCircle2 className="size-3 text-green-400" />}
                            </p>
                            <p className="text-sm text-teal-400">{e.value}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {e.position && <OutreachBadge variant="gray">{e.position}</OutreachBadge>}
                              <OutreachBadge variant="teal">{e.confidence}% Confidence</OutreachBadge>
                            </div>
                          </div>
                          <TealButton size="sm" variant="outline" onClick={() => handleSaveToContacts(e, 'domain')} disabled={loading}>
                            <Save className="size-4" />
                          </TealButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EMAIL FINDER */}
            {activeTab === 'finder' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-white block">First Name</label>
                    <input 
                      value={finderFname} onChange={(e) => setFinderFname(e.target.value)}
                      placeholder="e.g. Elon"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-white block">Last Name</label>
                    <input 
                      value={finderLname} onChange={(e) => setFinderLname(e.target.value)}
                      placeholder="e.g. Musk"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-semibold text-white block">Company Domain</label>
                    <input 
                      value={finderDomain} onChange={(e) => setFinderDomain(e.target.value)}
                      placeholder="e.g. spacex.com"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-500/50"
                    />
                  </div>
                  <TealButton className="col-span-2" onClick={doEmailFinder} disabled={loading || !finderFname || !finderLname || !finderDomain}>
                    {loading ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Find Email'}
                  </TealButton>
                </div>

                {finderResult && (
                  <div className="p-5 bg-teal-500/10 border border-teal-500/20 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white mb-1">{finderResult.first_name} {finderResult.last_name}</h4>
                      <p className="text-lg text-teal-400 font-medium">{finderResult.email}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <OutreachBadge variant="teal">{finderResult.score}% Confidence</OutreachBadge>
                        {finderResult.verification?.status && (
                           <OutreachBadge variant={finderResult.verification.status === 'valid' ? 'green' : 'gray'}>
                             {finderResult.verification.status}
                           </OutreachBadge>
                        )}
                      </div>
                    </div>
                    <TealButton size="sm" onClick={() => handleSaveToContacts(finderResult, 'finder')} disabled={loading}>
                      <Save className="size-4" /> Save
                    </TealButton>
                  </div>
                )}
              </div>
            )}

            {/* EMAIL VERIFIER */}
            {activeTab === 'verifier' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-white block">Email Address to Verify</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                      <input 
                        value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)}
                        placeholder="e.g. contact@domain.com"
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/50"
                      />
                    </div>
                    <TealButton onClick={doEmailVerifier} disabled={loading || !verifyEmail}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : 'Verify'}
                    </TealButton>
                  </div>
                </div>

                {verifyResult && (
                  <div className={`p-5 border rounded-2xl ${verifyResult.status === 'valid' ? 'bg-green-500/10 border-green-500/20' : verifyResult.status === 'invalid' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-white">{verifyResult.email}</h4>
                      <OutreachBadge variant={verifyResult.status === 'valid' ? 'green' : verifyResult.status === 'invalid' ? 'red' : 'yellow'}>
                        {verifyResult.status.toUpperCase()}
                      </OutreachBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400 block text-xs">Score</span>
                        <span className="text-white font-medium">{verifyResult.score}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">Format</span>
                        <span className="text-white font-medium">{verifyResult.format ? 'Valid' : 'Invalid'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">SMTP Check</span>
                        <span className="text-white font-medium">{verifyResult.smtp_check ? 'Passed' : 'Failed'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">Role-based</span>
                        <span className="text-white font-medium">{verifyResult.regexp ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SAVED LEADS */}
            {activeTab === 'saved' && (
              <div className="space-y-4">
                {loading && !savedLeads.length ? (
                  <div className="py-12 flex justify-center"><Loader2 className="size-8 animate-spin text-teal-500" /></div>
                ) : savedLeads.length === 0 ? (
                  <div className="py-12 text-center">
                    <HardDrive className="size-10 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">No leads saved from Hunter.io yet.</p>
                  </div>
                ) : (
                  savedLeads.map(lead => (
                    <div key={lead.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white text-sm">{lead.firstName} {lead.lastName}</p>
                        <p className="text-xs text-teal-400 font-medium">{lead.email}</p>
                        <p className="text-xs text-slate-400 mt-1">{lead.company}</p>
                      </div>
                      <div className="text-right">
                        <OutreachBadge variant="teal">{lead.confidence_score}% Conf.</OutreachBadge>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Status: {lead.verification_status}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
