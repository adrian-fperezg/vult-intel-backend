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
  const [icpProfile, setIcpProfile] = useState<{
    jobTitles: string[];
    industries: string[];
    countries: string[];
    companySize: string;
  }>({
    jobTitles: [],
    industries: [],
    countries: [],
    companySize: ''
  });

  // Sync icpProfile with icpData when loaded
  useEffect(() => {
    if (icpData) {
      setIcpProfile({
        jobTitles: icpData.jobTitles || [],
        industries: icpData.industries || [],
        countries: icpData.countries || [],
        companySize: icpData.companySize || ''
      });
    }
  }, [icpData]);

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
      // Pass the current icpProfile as context
      const data = await api.hunterAiExtract(prompt, icpProfile);
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

  const executeSearch = async (params: any, searchPrompt?: string) => {
    setIsSearching(true);
    setErrorMsg(null);
    setSelectedIds(new Set());
    setSearchProgress(0);
    startLoadingTimer();
    try {
      // Step 1: Initial discovery
      setSearchProgress(25);
      
      const data = await api.hunterSearchPeople({
        ...params,
        excludeExisting,
        exclusionListIds
      }, limit);

      if (data.error) throw new Error(data.error);
      
      const people = data.people || [];
      const mapped = people.map((p: any) => ({
        ...p,
        display_name: p.fullName || p.email,
        type: 'person'
      }));

      setResults(mapped);
      toast.success(`Found ${mapped.length} matching leads across ${data.metadata?.companiesProcessed || 0} companies`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Discovery engine failed');
      toast.error(err.message || 'Discovery engine failed');
    } finally {
      setIsSearching(false);
      stopLoadingTimer();
    }
  };

  const handleICPSearch = async () => {
    if (!icpProfile || (icpProfile.jobTitles.length === 0 && icpProfile.industries.length === 0)) {
      toast.error('Please configure your ICP filters first.');
      return;
    }

    const searchParams = {
      searchType: 'company_discovery',
      keywords: icpProfile.jobTitles?.join(', ') || '',
      industry: icpProfile.industries?.join(', ') || '',
      sizeRange: icpProfile.companySize || '',
      country: icpProfile.countries?.join(', ') || ''
    };

    await executeSearch(searchParams, 'ICP Search Results');
  };

  const handleBlueprintSearch = async () => {
    if (!aiResult) return;
    await executeSearch(aiResult.params, prompt);
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
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      email: r.email || '',
      company: r.company || r.domain || 'N/A',
      companyDomain: r.domain || '',
      industry: r.industry || '',
      companySize: r.companySize || '',
      locationCountry: r.country || '',
      locationCity: r.city || '',
      jobTitle: r.title || '',
      linkedinUrl: r.linkedinUrl || '',
      status: 'not_enrolled',
      tags: ['lead-finder', `source-${r.source || 'hunter'}`],
      project_id: api.activeProjectId
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

  const handleSaveContact = async (lead: any) => {
    try {
      await api.createContact({
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        email: lead.email,
        company: lead.company || lead.domain || '',
        companyDomain: lead.domain || '',
        industry: lead.industry || '',
        companySize: lead.companySize || '',
        locationCountry: lead.country || '',
        locationCity: lead.city || '',
        jobTitle: lead.title || '',
        linkedinUrl: lead.linkedinUrl || '',
        status: 'not_enrolled',
        tags: ['lead-finder', `source-${lead.source}`],
        project_id: api.activeProjectId
      });
      toast.success(`Saved ${lead.fullName || lead.email} to CRM`);
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

            {/* ICP Selection & Filter Block */}
            <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
              {/* Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20">
                    <Filter className="size-4 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Global Baseline</p>
                    <p className="text-xs font-bold text-white uppercase tracking-tight">{icpData?.name || 'Ideal Customer Profile'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <OutreachBadge variant={isLoadingIcp ? 'gray' : 'teal'}>{isLoadingIcp ? 'Loading' : 'Active'}</OutreachBadge>
                </div>
              </div>

              {/* Filter Grids */}
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  {/* Job Titles */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 block">Job Titles</label>
                    <textarea 
                      value={(icpProfile.jobTitles || []).join(', ')}
                      onChange={(e) => setIcpProfile({ ...icpProfile, jobTitles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="e.g. CEO, Founder, VP Sales"
                      className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-teal-500/50 min-h-[60px] resize-none transition-all"
                    />
                  </div>

                  {/* Industries */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 block">Industries</label>
                    <textarea 
                      value={(icpProfile.industries || []).join(', ')}
                      onChange={(e) => setIcpProfile({ ...icpProfile, industries: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="e.g. SaaS, Fintech, Crypto"
                      className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-teal-500/50 min-h-[60px] resize-none transition-all"
                    />
                  </div>

                  {/* Company Size */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 block">Company Size</label>
                    <select 
                      value={icpProfile.companySize || ''}
                      onChange={(e) => setIcpProfile({ ...icpProfile, companySize: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-3 h-10 text-xs text-slate-300 focus:outline-none focus:border-teal-500/50 transition-all appearance-none"
                    >
                      <option value="">Any Size</option>
                      <option value="1-10">1-10</option>
                      <option value="11-50">11-50</option>
                      <option value="51-200">51-200</option>
                      <option value="201-500">201-500</option>
                      <option value="501-1000">501-1000</option>
                      <option value="1001-5000">1001-5000</option>
                      <option value="10000+">10000+</option>
                    </select>
                  </div>

                  {/* Countries */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 block">Countries</label>
                    <input 
                      type="text"
                      value={(icpProfile.countries || []).join(', ')}
                      onChange={(e) => setIcpProfile({ ...icpProfile, countries: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="e.g. US, UK, DE"
                      className="w-full bg-black/40 border border-white/5 rounded-xl px-3 h-10 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-teal-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* ICP Search Button */}
                <TealButton 
                  onClick={handleICPSearch}
                  variant="outline"
                  disabled={isLoadingIcp || isSearching || (icpProfile.jobTitles.length === 0 && icpProfile.industries.length === 0)}
                  className="w-full bg-[#161b22] hover:bg-[#1f242c] border border-white/10 text-slate-300 hover:text-white py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 group"
                >
                  <Search className="size-3.5 text-slate-500 group-hover:text-teal-400 transition-colors" />
                  Apply ICP & Search Results
                </TealButton>
              </div>
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
                        {(aiResult.params?.jobTitles || []).map((title, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium">
                            {title}
                          </span>
                        ))}
                        {(!aiResult.params?.jobTitles || aiResult.params.jobTitles.length === 0) && (
                          <span className="text-[10px] text-slate-600 italic">No job titles specified</span>
                        )}
                      </div>
                    </div>

                    {/* Industries */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Industries</p>
                      <div className="flex flex-wrap gap-2">
                        {(aiResult.params?.industries || []).map((ind, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium">
                            {ind}
                          </span>
                        ))}
                        {(!aiResult.params?.industries || aiResult.params.industries.length === 0) && (
                          <span className="text-[10px] text-slate-600 italic">No industries specified</span>
                        )}
                      </div>
                    </div>

                    {/* Seniority */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Seniority</p>
                      <div className="flex flex-wrap gap-2">
                        {(aiResult.params?.seniority || []).map((s, idx) => (
                          <span key={idx} className="px-3 py-1 text-xs bg-[#0a2724] border border-[#114a43] text-teal-400 rounded-md font-medium uppercase tracking-tighter">
                            {s}
                          </span>
                        ))}
                        {(!aiResult.params?.seniority || aiResult.params.seniority.length === 0) && (
                          <span className="text-[10px] text-slate-600 italic">Any seniority</span>
                        )}
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
                      onClick={handleBlueprintSearch}
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
                    <h4 className="text-white font-bold leading-none mb-1">
                      {searchProgress < 25 ? 'Finding relevant companies...' : 
                       searchProgress < 75 ? 'Researching key decision makers...' : 
                       'Verifying high-intent contacts...'}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-mono tracking-widest uppercase">
                      Targeting {aiResult?.params.industries[0] || 'Selected Industries'} • Finding {aiResult?.params.seniority?.[0] || 'Execs'}
                    </p>
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
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Lead Contact</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Title & Dept</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Company</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Source</th>
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
                              <div className="size-10 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 group-hover:border-teal-500/50 transition-colors">
                                <User className="size-5 text-teal-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors truncate">{String(item.fullName || item.email || 'Unknown Lead')}</p>
                                <div className="flex items-center gap-2">
                                  <Mail className="size-3 text-slate-600" />
                                  <span className="text-[10px] text-slate-500 font-medium truncate">{String(item.email || 'No email')}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex flex-col gap-1">
                              <p className="text-xs font-bold text-slate-300 truncate max-w-[150px]">{item.title || 'Role Unknown'}</p>
                              <div className="flex items-center gap-2">
                                <OutreachBadge variant="gray">{item.seniority || 'Professional'}</OutreachBadge>
                                {item.department && <span className="text-[9px] text-slate-600 uppercase font-black">{item.department}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className="flex flex-col gap-1">
                              <p className="text-xs font-bold text-white group-hover:text-teal-400 transition-colors">{item.company}</p>
                              <div className="flex items-center gap-1.5">
                                <Globe className="size-3 text-slate-600" />
                                <span className="text-[10px] text-slate-500 font-medium">{item.domain}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 cursor-pointer" onClick={() => setSelectedLead(item)}>
                            <div className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md w-fit border",
                              item.source === 'pdl' 
                                ? "bg-blue-500/10 border-blue-500/30 text-blue-400" 
                                : "bg-teal-500/10 border-teal-500/30 text-teal-400"
                            )}>
                              <Database className="size-3" />
                              <span className="text-[9px] font-black uppercase tracking-widest">{item.source}</span>
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
                    <div className="size-12 bg-teal-500/10 rounded-2xl border border-teal-500/20 flex items-center justify-center shadow-xl">
                      <User className="size-6 text-teal-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white leading-tight">{selectedLead.fullName}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="size-3 text-teal-400" />
                        <span className="text-xs text-slate-500">{selectedLead.email}</span>
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
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500/80">Position Details</h3>
                    <div className="bg-white/[0.02] p-4 rounded-2xl border border-white/5 space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Job Title</p>
                        <p className="text-sm font-bold text-white">{selectedLead.title || 'Professional'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Seniority</p>
                          <OutreachBadge variant="teal">{selectedLead.seniority || 'Professional'}</OutreachBadge>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Department</p>
                          <p className="text-sm font-bold text-white truncate">{selectedLead.department || 'General'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Company</p>
                      <p className="text-sm font-bold text-white truncate">{selectedLead.company}</p>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Domain</p>
                      <p className="text-sm font-bold text-white truncate">{selectedLead.domain}</p>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Source Confidence</p>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-teal-400" />
                        <p className="text-sm font-bold text-white">{selectedLead.confidence}%</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Location</p>
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3 text-slate-500" />
                        <p className="text-sm font-bold text-white truncate">{selectedLead.city || selectedLead.country || 'Global'}</p>
                      </div>
                    </div>
                    {(selectedLead.linkedinUrl || selectedLead.twitter) && (
                      <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3 col-span-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Social Profiles</p>
                        <div className="flex gap-4">
                          {selectedLead.linkedinUrl && (
                            <a 
                              href={selectedLead.linkedinUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs font-bold text-teal-400 flex items-center gap-2 hover:underline"
                            >
                              LinkedIn <ExternalLink className="size-3" />
                            </a>
                          )}
                          {selectedLead.twitter && (
                            <a 
                              href={selectedLead.twitter} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs font-bold text-teal-400 flex items-center gap-2 hover:underline"
                            >
                              Twitter <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
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
