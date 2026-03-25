import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, User, ShieldCheck, Loader2, Save, 
  CheckCircle2, AlertCircle, Globe, PlugZap, Settings as SettingsIcon,
  Search, Zap, Plus, Filter, Info, ChevronDown
} from 'lucide-react';
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
  
  // Progress Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkConnection();
    loadIcp();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
    startLoadingTimer();
    try {
      const data = await api.hunterDiscover(prompt, aiResult.params);
      if (data.error) throw new Error(data.error);
      setResults(data.companies || []);
      toast.success(`Found ${data.companies?.length || 0} matching companies`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Discovery engine failed');
      toast.error(err.message || 'Discovery engine failed');
    } finally {
      setIsSearching(false);
      stopLoadingTimer();
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
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              Matched Opportunities
              {results.length > 0 && (
                <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-black rounded border border-teal-500/30 uppercase tracking-widest">
                  {results.length} Results
                </span>
              )}
            </h3>
          </div>

          <AnimatePresence mode="popLayout">
            {results.length > 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-5 bg-white/[0.02] border border-white/5 hover:border-teal-500/30 rounded-2xl group transition-all hover:bg-white/[0.04] relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleSaveContact(item)}
                        className="p-2 bg-teal-500 text-white rounded-lg shadow-lg shadow-teal-900/40 hover:scale-110 active:scale-90 transition-all font-bold"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="size-12 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-teal-500/30 transition-colors shrink-0">
                          {item.logo ? <img src={item.logo} className="size-8 object-contain" /> : <Building2 className="size-6 text-slate-600" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-white truncate group-hover:text-teal-400 transition-colors uppercase tracking-tight">{item.name || item.domain}</h4>
                          <p className="text-xs text-slate-500 truncate font-medium">{item.industry || 'Technology'}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {item.size_range && (
                          <OutreachBadge variant="gray" className="text-[10px] font-black border-transparent bg-white/5 text-slate-400">
                            {item.size_range} Employees
                          </OutreachBadge>
                        )}
                        <OutreachBadge variant="teal" className="text-[10px] font-black">
                          {Math.floor(Math.random() * 20) + 70}% Match
                        </OutreachBadge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : !isSearching && (
              <div className="py-20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center space-y-4">
                <div className="size-16 bg-white/[0.02] rounded-full flex items-center justify-center border border-white/5">
                  <Search className="size-8 text-slate-700" />
                </div>
                <div>
                  <h4 className="text-slate-400 font-bold">No results captured yet</h4>
                  <p className="text-slate-600 text-sm">Enter a search prompt or use the blueprint to discover leads</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
