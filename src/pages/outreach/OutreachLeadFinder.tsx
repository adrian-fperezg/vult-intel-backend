import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, User, ShieldCheck, Loader2, Save, 
  CheckCircle2, AlertCircle, Globe, PlugZap, Settings as SettingsIcon,
  Search, Zap, Plus, Filter, Info, ChevronDown, Check, Database, Users, 
  Trash2, Mail, ExternalLink, MapPin, Briefcase, ListFilter, X as CloseIcon
} from 'lucide-react';
import BulkAddToListModal from './contacts/BulkAddToListModal';
import { TealButton, OutreachBadge, OutreachSectionHeader } from './OutreachCommon';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ExtractedParams {
  jobTitles: string[];
  industries: string[];
  seniority: string[];
  keywords?: string;
  sizeRange?: string;
  country?: string;
  revenue?: string;
}

interface AIResult {
  searchType: 'company_discovery' | 'domain_search';
  confidence: number;
  reasoning: string;
  params: ExtractedParams;
}

export default function OutreachLeadFinder() {
  const api = useOutreachApi();
  
  // Connection Guard State
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [hasConnection, setHasConnection] = useState(false);

  // Search & AI State
  const [prompt, setPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // ICP State
  const [icpData, setIcpData] = useState<any | null>(null);
  const [isLoadingIcp, setIsLoadingIcp] = useState(false);

  // Search Controls
  const [limit, setLimit] = useState(25);
  const [excludeExisting, setExcludeExisting] = useState(true);
  const [exclusionListIds, setExclusionListIds] = useState<string[]>([]);
  const [contactLists, setContactLists] = useState<any[]>([]);

  // Selection & Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSavingSelected, setIsSavingSelected] = useState(false);
  const [bulkAddModalOpen, setBulkAddModalOpen] = useState(false);
  
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [showExclusionDropdown, setShowExclusionDropdown] = useState(false);
  
  // Progress Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkConnection();
    loadIcp();
    loadLists();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [api.activeProjectId]);

  const loadLists = async () => {
    try {
      const data = await api.fetchContactLists();
      if (data) setContactLists(data);
    } catch (err) {
      console.error('Failed to load lists:', err);
    }
  };

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

  const loadIcp = async () => {
    if (!api.activeProjectId) return;
    try {
      setIsLoadingIcp(true);
      const data = await api.fetchIcp();
      setIcpData(data);
    } catch (err) {
      console.error('Failed to load ICP:', err);
    } finally {
      setIsLoadingIcp(false);
    }
  };

  const handleAiExtract = async () => {
    if (!prompt.trim()) return;
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const data = await api.hunterAiExtract(prompt, icpData);
      if (data.error) throw new Error(data.error);
      setAiResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to extract blueprints');
      toast.error(err.message || 'Failed to extract blueprints');
    } finally {
      setIsExtracting(false);
    }
  };

  const startLoadingTimer = () => {
    setSearchProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSearchProgress(prev => {
        if (prev >= 98) return prev;
        return prev + (prev < 50 ? 2 : prev < 80 ? 1 : 0.5);
      });
    }, 100);
  };

  const stopLoadingTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSearchProgress(100);
    setTimeout(() => setSearchProgress(0), 500);
  };

  const handleSearch = async () => {
    if (!aiResult) return;
    setIsSearching(true);
    setErrorMsg(null);
    setSelectedIds(new Set());
    startLoadingTimer();
    try {
      const data = await api.hunterDiscover(prompt, {
        ...aiResult.params,
        limit,
        excludeExisting,
        exclusionListIds
      });
      if (data.error) throw new Error(data.error);
      
      // Map company results to a more "contact-like" structure if needed
      // Hunter Discover returns companies. We'll store them as-is for now.
      const mapped = (data.companies || []).map((c: any) => ({
        ...c,
        id: c.domain || Math.random().toString(36).substr(2, 9), // Use domain as stable ID
        display_name: c.name || c.domain,
        type: 'company'
      }));

      setResults(mapped);
      toast.success(`Found ${mapped.length} matching results`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Discovery engine failed');
      toast.error(err.message || 'Discovery engine failed');
    } finally {
      setIsSearching(false);
      stopLoadingTimer();
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkSave = async (listId?: string) => {
    const toSave = results.filter(r => selectedIds.has(r.id)).map(r => ({
      first_name: 'Lead',
      last_name: 'Contact',
      email: `info@${r.domain}`, // Enriched later or generic
      company: r.name || r.domain,
      website: r.domain,
      industry: r.industry,
      size: r.size_range,
      location: r.location,
      company_domain: r.domain,
      status: 'not_enrolled',
      tags: ['lead-finder']
    }));

    setIsSavingSelected(true);
    try {
      if (listId) {
        await api.saveContactsToList(api.activeProjectId!, listId, toSave);
        toast.success(`Saved ${toSave.length} leads to list`);
      } else {
        await api.createContactsBulk(api.activeProjectId!, toSave);
        toast.success(`Saved ${toSave.length} leads to CRM`);
      }
      setSelectedIds(new Set());
      setBulkAddModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save leads');
    } finally {
      setIsSavingSelected(false);
    }
  };

  const handleSaveContact = async (company: any) => {
    try {
      await api.createContact({
        first_name: 'Lead', // Hunter Discovery returns companies, usually we find people later
        last_name: 'Contact',
        email: `info@${company.domain}`, // Placeholder or generic
        company: company.name || company.domain,
        website: company.domain,
        industry: company.industry,
        size: company.size_range,
        status: 'not_enrolled',
        tags: ['lead-finder']
      });
      toast.success(`Saved ${company.name || company.domain} to CRM`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const goToSettings = () => {
    window.dispatchEvent(new CustomEvent('outreach-tab-change', { detail: 'settings' }));
  };

  const toggleExclusionList = (listId: string) => {
    const next = [...exclusionListIds];
    const idx = next.indexOf(listId);
    if (idx > -1) next.splice(idx, 1);
    else next.push(listId);
    setExclusionListIds(next);
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
    <div className="h-full flex flex-col bg-[#0d1117] overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto w-full p-8 space-y-8">
        
        {/* TOP SECTION: TWO-COLUMN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* LEFT COLUMN: Header & Search */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-500/10 rounded-2xl border border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
                <Zap className="size-6 text-teal-400 fill-teal-400/20" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Lead Finder</h1>
                <p className="text-slate-400 text-sm font-medium">Generate high-intent lead lists with AI extrations</p>
              </div>
            </div>

            {/* ICP Selection Dropdown (Mock) */}
            <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3">
                <div className="size-10 bg-black/40 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-teal-500/30 transition-colors">
                  <Filter className="size-5 text-slate-500 group-hover:text-teal-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {isLoadingIcp ? 'Loading...' : icpData ? 'Active Profile' : 'No Profile Set'}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {icpData?.name || 'Ideal Customer Profile (ICP)'}
                  </p>
                </div>
              </div>
              <ChevronDown className="size-5 text-slate-600 group-hover:text-white transition-colors" />
            </div>

            {/* Search Input Box */}
            <div className="relative group">
              <div className="absolute inset-0 bg-teal-500/5 rounded-2xl blur-xl group-focus-within:bg-teal-500/10 transition-all" />
              <div className="relative bg-[#0d1117] border border-white/10 rounded-2xl p-2 flex items-center gap-2 focus-within:border-teal-500/50 transition-all shadow-2xl">
                <div className="pl-4">
                  <Search className="size-5 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
                </div>
                <input 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask AI to find leads (e.g. 'Founders in NYC SaaS companies with 10-50 employees')"
                  className="flex-1 bg-transparent border-none py-3 text-sm text-white focus:outline-none placeholder:text-slate-600"
                  onKeyDown={(e) => e.key === 'Enter' && handleAiExtract()}
                />
                <TealButton 
                  onClick={handleAiExtract} 
                  loading={isExtracting}
                  disabled={!prompt.trim()}
                  className="rounded-xl px-6 h-11 font-bold"
                >
                  Generate
                </TealButton>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: AI Extraction Card */}
          <div className="relative h-full">
            <div className="bg-[#111111] border border-white/10 rounded-[2rem] p-8 h-full shadow-2xl overflow-hidden relative min-h-[300px] flex flex-col">
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 size-48 bg-teal-500/10 blur-[100px] rounded-full" />
              
              {!aiResult && !isExtracting && (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="size-16 bg-white/[0.02] border border-white/5 rounded-3xl flex items-center justify-center mb-2">
                    <Info className="size-8 text-slate-700" />
                  </div>
                  <h4 className="text-white font-bold text-lg">AI Parameter Extractor</h4>
                  <p className="text-slate-500 text-sm max-w-[280px] leading-relaxed">
                    Describe your ideal target and our AI will extract high-precision search blueprints.
                  </p>
                </div>
              )}

              {isExtracting && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
                  <div className="relative">
                    <div className="size-20 border-2 border-teal-500/20 border-t-teal-400 rounded-full animate-spin" />
                    <Zap className="size-8 text-teal-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-teal-400/20" />
                  </div>
                  <div className="space-y-2 text-center">
                    <h4 className="text-white font-bold">Synthesizing Blueprint...</h4>
                    <p className="text-xs text-slate-500 font-mono tracking-widest uppercase">Analyzing intent • Matching industries</p>
                  </div>
                </div>
              )}

              {aiResult && !isExtracting && (
                <div className="flex-1 flex flex-col space-y-6 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Extracted Blueprint</h4>
                    <div className="flex items-center gap-2 px-3 py-1 bg-teal-500/10 border border-teal-500/20 rounded-md">
                      <div className="size-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                      <span className="text-[10px] font-black text-teal-400 uppercase tracking-wider">{aiResult.confidence}% Confidence</span>
                    </div>
                  </div>

                  <div className="space-y-5 flex-1">
                    {/* Job Titles */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Job Titles</p>
                      <div className="flex flex-wrap gap-2">
                        {aiResult.params.jobTitles.map((title, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium">
                            {title}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Industries */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Industries</p>
                      <div className="flex flex-wrap gap-2">
                        {aiResult.params.industries.map((ind, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium">
                            {ind}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Seniority */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Seniority</p>
                      <div className="flex flex-wrap gap-2">
                        {aiResult.params.seniority.map((s, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium uppercase tracking-tighter">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* Keywords & Revenue */}
                    <div className="grid grid-cols-2 gap-4">
                      {aiResult.params.keywords && (
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Keywords</p>
                          <span className="px-3 py-1 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-md font-medium">
                            {aiResult.params.keywords}
                          </span>
                        </div>
                      )}
                      {aiResult.params.revenue && (
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Revenue Target</p>
                          <span className="px-3 py-1 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-md font-medium">
                            {aiResult.params.revenue}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5 flex items-center gap-3">
                    <button 
                      onClick={() => setAiResult(null)}
                      className="flex-1 py-3 text-xs font-bold text-slate-500 hover:text-white bg-transparent border border-white/5 hover:border-white/20 rounded-xl transition-all"
                    >
                      Refine Prompt
                    </button>
                    <TealButton 
                      onClick={handleSearch}
                      loading={isSearching}
                      className="flex-[1.5] py-3 rounded-xl font-bold shadow-lg shadow-teal-500/20"
                    >
                      Apply & Search Now
                    </TealButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LOADING PROGRESS BAR */}
        <AnimatePresence>
          {isSearching && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full bg-[#111111] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden"
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20">
                    <Loader2 className="size-5 text-teal-400 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold leading-none mb-1">Scanning Global Databases...</h4>
                    <p className="text-[11px] text-slate-500 font-mono tracking-widest uppercase">Crunching {aiResult?.params.industries[0]} Leads • Searching Job Titles</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-teal-400 font-black text-xl tabular-nums leading-none tracking-tighter">{Math.round(searchProgress)}%</p>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-1">Verification Sync</p>
                </div>
              </div>
              
              <div className="h-2 w-full bg-white/[0.02] rounded-full overflow-hidden border border-white/5 relative z-10">
                <motion.div 
                  className="h-full bg-gradient-to-r from-teal-600 to-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${searchProgress}%` }}
                />
              </div>

              {/* Animated pulses behind */}
              <div className="absolute top-0 right-0 h-full w-1/2 bg-gradient-to-l from-teal-500/5 to-transparent skew-x-12 animate-pulse" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* RESULTS SECTION */}
        <div className="space-y-6 pb-32">
          {/* List Settings / Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-white/5">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              Matched Opportunities
              {results.length > 0 && (
                <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-black rounded border border-teal-500/30 uppercase tracking-widest">
                  {results.length} Results
                </span>
              )}
            </h3>

            <div className="flex items-center gap-4">
              {/* Limit Selector */}
              <div className="flex items-center gap-2 bg-white/5 rounded-lg p-1 border border-white/10">
                {[10, 25, 50, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setLimit(val)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all",
                      limit === val ? "bg-teal-500 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>

              {/* Exclusion Toggles */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button 
                    onClick={() => setShowExclusionDropdown(!showExclusionDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:border-teal-500/30 transition-all text-[10px] font-bold text-slate-400 uppercase tracking-wider"
                  >
                    <ListFilter className="size-4 text-slate-500" />
                    Exclusion Lists ({exclusionListIds.length})
                  </button>
                  
                  <AnimatePresence>
                    {showExclusionDropdown && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full mt-2 right-0 w-64 bg-[#1a1f26] border border-white/10 rounded-xl shadow-2xl z-50 p-2 space-y-1"
                      >
                        <p className="px-3 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">Select Lists to Exclude</p>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                          {contactLists.length === 0 ? (
                            <p className="p-4 text-[10px] text-slate-600 text-center italic">No lists found</p>
                          ) : contactLists.map(list => (
                            <button
                              key={list.id}
                              onClick={() => toggleExclusionList(list.id)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                            >
                              <span className="text-xs text-slate-400 group-hover:text-white truncate">{list.name}</span>
                              {exclusionListIds.includes(list.id) && <Check className="size-3 text-teal-400" />}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg">
                  <ShieldCheck className={cn("size-4", excludeExisting ? "text-teal-400" : "text-slate-600")} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CRM Exclude</span>
                  <button 
                    onClick={() => setExcludeExisting(!excludeExisting)}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-colors",
                      excludeExisting ? "bg-teal-500" : "bg-slate-700"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 size-3 bg-white rounded-full transition-all",
                      excludeExisting ? "left-4.5" : "left-0.5"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {results.length > 0 ? (
              <div className="bg-[#111111]/50 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="p-4 w-10">
                        <button 
                          onClick={toggleSelectAll}
                          className={cn(
                            "size-5 rounded border flex items-center justify-center transition-colors",
                            selectedIds.size === results.length 
                              ? "bg-teal-500 border-teal-500 text-white" 
                              : "border-white/20 hover:border-teal-500/50"
                          )}
                        >
                          {selectedIds.size === results.length && <Check className="size-3 stroke-[4]" />}
                        </button>
                      </th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Company Info</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Industry & Size</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Match %</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">AI Persona</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item, idx) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <motion.tr 
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className={cn(
                            "group border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors",
                            isSelected && "bg-teal-500/[0.03]"
                          )}
                        >
                          <td className="p-4">
                            <button 
                              onClick={() => toggleSelect(item.id)}
                              className={cn(
                                "size-5 rounded border flex items-center justify-center transition-colors",
                                isSelected 
                                  ? "bg-teal-500 border-teal-500 text-white" 
                                  : "border-white/10 group-hover:border-teal-500/30"
                              )}
                            >
                              {isSelected && <Check className="size-3 stroke-[4]" />}
                            </button>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex items-center gap-3">
                              <div className="size-10 bg-black/40 rounded-xl overflow-hidden border border-white/10 group-hover:border-teal-500/30 transition-colors">
                                <img src={item.logo} alt={item.name} className="size-full object-contain p-1" onError={(e) => (e.currentTarget.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + item.domain)} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors truncate">{item.name}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500 font-medium">{item.domain}</span>
                                  {item.description && <span className="text-[10px] text-slate-600 line-clamp-1 italic">— {item.description}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <Briefcase className="size-3 text-slate-600" />
                                <span className="text-xs text-slate-400 truncate max-w-[120px]">{item.industry || 'Technology'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="size-3 text-slate-600" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{item.size || 'Unknown'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-teal-500/10 border border-teal-500/20 rounded-md w-fit">
                              <span className="text-[10px] font-black text-teal-400">{item.match_score}%</span>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {(item.target_personas || []).slice(0, 2).map((p: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-slate-500 font-medium whitespace-nowrap">
                                  {p}
                                </span>
                              ))}
                              {(item.target_personas || []).length > 2 && (
                                <span className="text-[9px] text-slate-600 font-bold">+{item.target_personas.length - 2}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => handleSaveContact(item)}
                              className="p-2 text-slate-600 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg transition-all"
                              title="Save to CRM"
                            >
                              <Plus className="size-5" />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : !isSearching && (
              <div className="py-20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center space-y-4">
                <div className="size-16 bg-white/[0.02] rounded-full flex items-center justify-center border border-white/5">
                  <Search className="size-8 text-slate-700" />
                </div>
                <div>
                  <h4 className="text-slate-400 font-bold">No leads discovered yet</h4>
                  <p className="text-slate-600 text-sm max-w-sm mx-auto">
                    Use the AI Extracter to define your blueprint, then hit "Apply & Search" to populate this list.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* PERSISTENT ACTION BAR */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
            >
              <div className="bg-[#1a1f26] border border-teal-500/30 rounded-2xl p-4 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(20,184,166,0.1)] flex items-center justify-between gap-6 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <div className="size-10 bg-teal-500 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-teal-500/20">
                    {selectedIds.size}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white uppercase tracking-tight">Leads Selected</p>
                    <p className="text-[10px] text-slate-400 font-medium">Ready for bulk import</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    Clear All
                  </button>
                  <div className="h-4 w-px bg-white/10" />
                  <button 
                    onClick={() => setBulkAddModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    <Save className="size-4 text-teal-400" />
                    Save as List
                  </button>
                  <TealButton 
                    onClick={() => handleBulkSave()}
                    loading={isSavingSelected}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-500/20"
                  >
                    Add to CRM
                  </TealButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <BulkAddToListModal 
          isOpen={bulkAddModalOpen}
          onClose={() => setBulkAddModalOpen(false)}
          onConfirm={handleBulkSave}
          contactLists={contactLists}
          onReloadLists={loadLists}
          api={api}
          selectedCount={selectedIds.size}
        />

        {/* DETAILS SIDEBAR */}
        <AnimatePresence>
          {selectedLead && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedLead(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0d1117] border-l border-white/10 shadow-2xl z-[70] flex flex-col"
              >
                {/* Sidebar Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <div className="size-12 bg-black rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden p-1.5 shadow-xl">
                      <img src={selectedLead.logo} alt={selectedLead.name} className="size-full object-contain" onError={(e) => (e.currentTarget.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + selectedLead.domain)} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white leading-tight">{selectedLead.name}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Globe className="size-3 text-teal-400" />
                        <span className="text-xs text-slate-500">{selectedLead.domain}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="p-2 hover:bg-white/5 rounded-xl transition-colors text-slate-500 hover:text-white"
                  >
                    <CloseIcon className="size-5" />
                  </button>
                </div>

                {/* Sidebar Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500/80">Description</h3>
                    <p className="text-sm text-slate-400 leading-relaxed bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                      {selectedLead.description || 'No description available for this lead.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Industry</p>
                      <p className="text-sm font-bold text-white truncate">{selectedLead.industry || 'Unknown'}</p>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Company Size</p>
                      <p className="text-sm font-bold text-white">{selectedLead.size || 'Unknown'}</p>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Match Score</p>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-teal-400" />
                        <p className="text-sm font-bold text-white">{selectedLead.match_score}%</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Location</p>
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3 text-slate-500" />
                        <p className="text-sm font-bold text-white truncate">{selectedLead.country || 'Global'}</p>
                      </div>
                    </div>
                    {selectedLead.linkedin && (
                      <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1 col-span-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">LinkedIn Profile</p>
                        <a 
                          href={selectedLead.linkedin} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-sm font-bold text-teal-400 flex items-center gap-2 hover:underline"
                        >
                          View Official Company Page
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500/80">AI Persona Targets</h3>
                    <div className="flex flex-wrap gap-2">
                      {(selectedLead.target_personas || []).map((p: string, i: number) => (
                        <span key={i} className="px-3 py-1.5 bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-lg text-xs font-medium">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="px-8 py-4 border-t border-white/5 bg-teal-500/5 rounded-2xl">
                    <button 
                      onClick={() => {
                        setSelectedIds(new Set([selectedLead.id]));
                        setBulkAddModalOpen(true);
                      }}
                      className="w-full py-2.5 rounded-xl text-teal-400 text-xs font-bold border border-teal-500/20 hover:bg-teal-500/10 transition-all flex items-center justify-center gap-2"
                    >
                      <Save className="size-4" />
                      Add to Specific List
                    </button>
                  </div>
                </div>

                {/* Sidebar Footer */}
                <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                  <button 
                    onClick={() => {
                      const next = new Set(selectedIds);
                      if (next.has(selectedLead.id)) next.delete(selectedLead.id);
                      else next.add(selectedLead.id);
                      setSelectedIds(next);
                    }}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                      selectedIds.has(selectedLead.id) 
                        ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20" 
                        : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10"
                    )}
                  >
                    {selectedIds.has(selectedLead.id) ? (
                      <><Check className="size-4 stroke-[3]" /> Selected</>
                    ) : (
                      <><Plus className="size-4" /> Select for Import</>
                    )}
                  </button>
                  <TealButton 
                    onClick={() => handleSaveContact(selectedLead)}
                    className="flex-1 py-3 rounded-xl font-bold text-xs"
                  >
                    Quick Add to CRM
                  </TealButton>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
