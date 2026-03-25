import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  Globe, 
  User, 
  Mail, 
  CheckCircle2, 
  AlertCircle,
  Plus,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Building2,
  ExternalLink,
  History,
  Zap,
  ChevronDown,
  Settings2,
  Tag,
  Briefcase,
  Users,
  MapPin,
  Cpu,
  Target,
  X,
  Check,
  ArrowRight,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

interface HunterLead {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  confidence: number;
  verification_status?: string;
}

interface DomainResult {
  domain: string;
  organization: string;
  emails: HunterLead[];
}

interface IcpProfile {
  job_titles: string[];
  industries: string[];
  company_sizes: string[];
  countries: string[];
  seniority: string[];
  technologies: string[];
  keywords: string;
}

interface ExtractedParams {
  searchType: 'company_discovery' | 'domain_search';
  confidence: number;
  reasoning: string;
  params: {
    keywords: string;
    industry: string;
    sizeRange: string;
    country: string;
    department: string;
    seniority: string;
  };
}

const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const SENIORITY_OPTIONS = ["junior", "senior", "director", "manager", "executive"];

export default function OutreachLeadFinder() {
  const { projectId } = useParams();
  const api = useOutreachApi();
  
  // Search State
  const [domain, setDomain] = useState('');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DomainResult | null>(null);
  
  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [extractedParams, setExtractedParams] = useState<ExtractedParams | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // ICP State
  const [icp, setIcp] = useState<IcpProfile>({
    job_titles: [],
    industries: [],
    company_sizes: [],
    countries: [],
    seniority: [],
    technologies: [],
    keywords: ''
  });
  const [isIcpOpen, setIsIcpOpen] = useState(false);
  const [isIcpSaving, setIsIcpSaving] = useState(false);

  // Hunter Connection State
  const [isHunterConnected, setIsHunterConnected] = useState<boolean | null>(null);

  // Selection State
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [isSavingSelected, setIsSavingSelected] = useState(false);

  // Search History State
  const [savedSearches, setSavedSearches] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportToSheets = async () => {
    if (!results || results.emails.length === 0) {
      toast.error("No leads to export");
      return;
    }

    const leadsToExport = results.emails.map(email => ({
      ...email,
      domain: results.domain,
      organization: results.organization
    }));

    setIsExporting(true);
    const loadingToast = toast.loading("Exporting results to Google Sheets...");
    try {
      const res = await api.exportToGoogleSheets(leadsToExport);
      toast.success("Successfully exported to Google Sheets!", { id: loadingToast });
      if (res.url) {
        window.open(res.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || "Export failed", { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await api.fetchSavedSearches();
      if (data) setSavedSearches(data);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!projectId) return;
      try {
        const [settings, icpData] = await Promise.all([
          api.fetchSettings(),
          api.fetchIcp()
        ]);
        setIsHunterConnected(settings.hasHunterKey);
        if (icpData) setIcp(icpData);
        fetchHistory();
      } catch (error) {
        console.error("Initialization failed:", error);
        setIsHunterConnected(false);
      }
    };
    init();
  }, [projectId, api]);

  const handleSearch = async (targetDomain?: string) => {
    const searchDomain = targetDomain || domain;
    if (!searchDomain) return;
    
    setIsSearching(true);
    setSelectedEmails(new Set());
    try {
      // Pass options for more specific search if needed
      const options = {
        seniority: selectedSeniority.length > 0 ? selectedSeniority.join(',') : undefined,
        department: 'sales,marketing,engineering' // Example preference
      };

      const data = await api.hunterDomainSearch(searchDomain, options);
      if (data) {
        const normalizedLeads = data.emails?.map((e: any) => ({
          first_name: e.first_name,
          last_name: e.last_name,
          email: e.value,
          position: e.position,
          confidence: e.confidence,
          verification_status: e.verification_status
        })) || [];

        // If no leads found, we still want to show an empty state, not a query-as-result
        setResults({
          domain: data.domain || searchDomain,
          organization: data.organization || (normalizedLeads.length > 0 ? searchDomain : ''),
          emails: normalizedLeads
        });

        // Auto-save search result only if leads were found
        if (normalizedLeads.length > 0) {
          api.saveHunterSearch({
            query: `Search: ${searchDomain}`,
            extracted_params: { domain: searchDomain, ...options },
            leads: normalizedLeads
          }).then(() => fetchHistory());
          toast.success(`Found ${normalizedLeads.length} leads for ${searchDomain}`);
        } else {
          toast.error(`No leads found for ${searchDomain}`);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Domain search failed");
      setResults({ domain: searchDomain, organization: '', emails: [] });
    } finally {
      setIsSearching(false);
    }
  };

  const loadSavedSearch = async (search: any) => {
    setIsSearching(true);
    setResults(null);
    setDomain(search.query.replace('Search: ', ''));
    try {
      const leads = await api.fetchSavedSearchLeads(search.id);
      setResults({
        domain: search.query.replace('Search: ', ''),
        organization: search.query.replace('Search: ', ''), // fallback
        emails: leads
      });
      setIsHistoryOpen(false);
    } catch (err) {
      toast.error("Failed to load search results");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAiExtract = async () => {
    if (!aiPrompt) return;
    setAiStatus('loading');
    setErrorMsg('');
    setExtractedParams(null);

    try {
      const data = await api.hunterAiExtract(aiPrompt, icp);
      setExtractedParams(data);
      setAiStatus('success');
    } catch (error: any) {
      setAiStatus('error');
      setErrorMsg(error.message || "AI Extraction failed");
    }
  };

  const confirmAiParams = () => {
    if (!extractedParams) return;
    
    // Apply extracted params to UI
    if (extractedParams.params.keywords) setDomain(extractedParams.params.keywords);
    if (extractedParams.params.seniority) {
       setSelectedSeniority([extractedParams.params.seniority.toLowerCase()]);
    }
    
    // Reset AI panel
    setAiStatus('idle');
    setExtractedParams(null);
    setAiPrompt('');
    
    // Trigger search
    if (extractedParams.params.keywords) {
      handleSearch(extractedParams.params.keywords);
    } else {
      toast.success("Ready! You can now refine the search locally.");
    }
  };

  const saveIcp = async () => {
    setIsIcpSaving(true);
    try {
      await api.updateIcp(icp);
      toast.success("ICP Profile updated");
      setIsIcpOpen(false);
    } catch (err) {
      toast.error("Failed to save ICP");
    } finally {
      setIsIcpSaving(false);
    }
  };

  const saveContact = async (lead: HunterLead) => {
    try {
      await api.createContact({
        project_id: projectId!,
        first_name: lead.first_name || 'Lead',
        last_name: lead.last_name || '',
        email: lead.email,
        title: lead.position,
        company: results?.organization,
        website: results?.domain,
        verification_status: lead.verification_status,
        confidence_score: lead.confidence,
        source_detail: 'Hunter Lead Finder'
      });
      toast.success(`Saved ${lead.email} to contacts`);
    } catch (error: any) {
      toast.error("Failed to save contact");
    }
  };

  const handleToggleSelect = (email: string) => {
    const next = new Set(selectedEmails);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelectedEmails(next);
  };

  const handleSelectAll = () => {
    if (!results) return;
    if (selectedEmails.size === results.emails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(results.emails.map(l => l.email)));
    }
  };

  const handleSaveSelected = async () => {
    if (selectedEmails.size === 0 || !results) return;
    setIsSavingSelected(true);
    try {
      const selectedLeads = results.emails.filter(l => selectedEmails.has(l.email));
      const payload = selectedLeads.map(l => ({
        first_name: l.first_name || 'Lead',
        last_name: l.last_name || '',
        email: l.email,
        title: l.position,
        company: results.organization,
        website: results.domain,
        verification_status: l.verification_status,
        confidence_score: l.confidence,
        source_detail: 'Hunter Lead Finder'
      }));

      await api.createContactsBulk(projectId!, payload);
      toast.success(`Successfully saved ${selectedLeads.length} leads to your project`);
      setSelectedEmails(new Set());
    } catch (error: any) {
      toast.error(error.message || "Bulk save failed");
    } finally {
      setIsSavingSelected(false);
    }
  };

  if (isHunterConnected === false) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
        <div className="size-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="size-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Hunter.io Not Connected</h2>
        <p className="text-slate-400 max-w-md mb-8">
          To use the Lead Finder, you first need to connect your Hunter.io API key in the Outreach settings.
        </p>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('outreach-tab-change', { detail: 'settings' }))}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header & Search */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Zap className="size-8 text-teal-400" />
              Lead Finder
            </h1>
            <p className="text-slate-400">
              Search domains or use AI to discover new leads and their verified contact information.
            </p>
          </div>
          <button 
            onClick={() => {
              setIsHistoryOpen(true);
              fetchHistory();
            }}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 rounded-2xl text-sm font-bold text-slate-300 transition-all group"
          >
            <History className="size-4 text-slate-500 group-hover:text-teal-400 transition-colors" />
            Search Library
          </button>
        </motion.div>

          {/* ICP PROFILE SECTION */}
          <div className="bg-surface-dark border border-white/5 rounded-3xl overflow-hidden">
            <button 
              onClick={() => setIsIcpOpen(!isIcpOpen)}
              className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <Target className="size-5 text-blue-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-white">Ideal Customer Profile (ICP)</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                    {isIcpOpen ? 'Configuring global targeting' : `${icp.job_titles.length + icp.industries.length} active filters`}
                  </p>
                </div>
              </div>
              <ChevronDown className={cn("size-5 text-slate-500 transition-transform", isIcpOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isIcpOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-6 space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <IcpField 
                      icon={<Briefcase className="size-3" />}
                      label="Job Titles" 
                      items={icp.job_titles} 
                      onChange={(items) => setIcp({ ...icp, job_titles: items })} 
                      placeholder="e.g. CTO, Head of Sales"
                    />
                    <IcpField 
                      icon={<Building2 className="size-3" />}
                      label="Industries" 
                      items={icp.industries} 
                      onChange={(items) => setIcp({ ...icp, industries: items })} 
                      placeholder="e.g. SaaS, Fintech"
                    />
                    <IcpField 
                      icon={<MapPin className="size-3" />}
                      label="Countries" 
                      items={icp.countries} 
                      onChange={(items) => setIcp({ ...icp, countries: items })} 
                      placeholder="e.g. USA, Germany"
                    />
                    <IcpField 
                      icon={<Cpu className="size-3" />}
                      label="Technologies" 
                      items={icp.technologies} 
                      onChange={(items) => setIcp({ ...icp, technologies: items })} 
                      placeholder="e.g. React, Salesforce"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Users className="size-3" /> Company Size
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {COMPANY_SIZE_OPTIONS.map(size => (
                        <button
                          key={size}
                          onClick={() => {
                            const newSizes = icp.company_sizes.includes(size)
                              ? icp.company_sizes.filter(s => s !== size)
                              : [...icp.company_sizes, size];
                            setIcp({ ...icp, company_sizes: newSizes });
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            icp.company_sizes.includes(size)
                              ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                              : "bg-white/5 border-white/5 text-slate-500 hover:border-white/20"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-4 gap-3">
                    <button 
                      onClick={() => setIsIcpOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={saveIcp}
                      disabled={isIcpSaving}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                    >
                      {isIcpSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      Save ICP Profile
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex gap-3 pt-2">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
              <input 
                type="text"
                placeholder="Enter domain (e.g. stripe.com)"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(domain)}
                maxLength={500}
                className="w-full bg-surface-dark border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-teal-500/50 transition-all placeholder:text-slate-600 shadow-inner"
              />
            </div>
            <button 
              onClick={() => handleSearch(domain)}
              disabled={isSearching || !domain}
              className="px-8 py-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
              Search
            </button>
          </div>
        </div>

        {/* AI ASSIST PANEL */}
        <div className="bg-gradient-to-br from-teal-500/10 to-blue-500/10 border border-teal-500/20 rounded-3xl p-6 relative overflow-hidden group min-h-[300px] flex flex-col">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Sparkles className="size-24 text-teal-400" />
          </div>
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="size-5 text-teal-400" />
                AI Parameter Extractor
              </h3>
              {aiStatus !== 'idle' && (
                <button 
                  onClick={() => { setAiStatus('idle'); setExtractedParams(null); setAiPrompt(''); }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="size-4 text-slate-500" />
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {aiStatus === 'idle' && (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-4 flex-1"
                >
                  <p className="text-sm text-slate-400">
                    Type a natural language request. I'll use your ICP context to automatically extract the best search parameters.
                  </p>
                  <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. 'Find marketing leads at series B startups in SF'"
                    className="w-full bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-teal-500/30 resize-none h-32 transition-all placeholder:text-slate-600"
                  />
                  <button 
                    onClick={handleAiExtract}
                    disabled={!aiPrompt}
                    className="w-full py-4 bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 text-sm font-bold rounded-2xl border border-teal-500/30 transition-all flex items-center justify-center gap-2 group/btn"
                  >
                    Analyze & Extract
                    <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              )}

              {aiStatus === 'loading' && (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center space-y-4 py-12"
                >
                  <div className="size-16 relative">
                    <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
                    <div className="absolute inset-0 rounded-full border-t-2 border-teal-400 animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto size-6 text-teal-400 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold">Analyzing Intent...</p>
                    <p className="text-xs text-slate-500">Cross-referencing with ICP guidelines</p>
                  </div>
                </motion.div>
              )}

              {aiStatus === 'success' && extractedParams && (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="space-y-6 flex-1"
                >
                  <div className="bg-black/30 rounded-2xl p-4 space-y-4 border border-white/5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {extractedParams.searchType === 'domain_search' ? 'Domain Blueprint' : 'Discovery Blueprint'}
                      </h4>
                      <div className="px-2 py-0.5 bg-emerald-500/20 rounded text-[10px] font-black text-emerald-400 uppercase">
                        {extractedParams.confidence}% Confidence
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Keywords / Target</p>
                        <p className="text-xs text-white font-medium truncate">{extractedParams.params.keywords || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Industry</p>
                        <p className="text-xs text-white font-medium">{extractedParams.params.industry || 'any'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Seniority</p>
                        <p className="text-xs text-white font-medium capitalize">{extractedParams.params.seniority || 'any'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Size Range</p>
                        <p className="text-xs text-white font-medium">{extractedParams.params.sizeRange || 'any'}</p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter mb-1">AI Reasoning</p>
                      <p className="text-xs text-slate-400 italic leading-relaxed">"{extractedParams.reasoning}"</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setAiStatus('idle')}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-400 text-sm font-bold rounded-xl border border-white/10 transition-all"
                    >
                      Refine Prompt
                    </button>
                    <button 
                      onClick={confirmAiParams}
                      className="flex-[2] py-3 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-teal-900/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Search className="size-4" />
                      Apply & Search Now
                    </button>
                  </div>
                </motion.div>
              )}

              {aiStatus === 'error' && (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col items-center justify-center space-y-4 text-center py-12"
                >
                  <div className="size-16 bg-red-500/10 rounded-full flex items-center justify-center">
                    <AlertCircle className="size-8 text-red-500" />
                  </div>
                  <div>
                    <p className="text-white font-bold">Extraction Failed</p>
                    <p className="text-xs text-red-400/80 max-w-[200px]">{errorMsg}</p>
                  </div>
                  <button 
                    onClick={() => setAiStatus('idle')}
                    className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl border border-white/10 transition-all"
                  >
                    Try Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence mode="wait">
        {results && results.emails.length > 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="size-12 bg-teal-500/20 rounded-2xl flex items-center justify-center">
                  <Building2 className="size-6 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{results.organization}</h2>
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <Globe className="size-3" /> {results.domain}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {selectedEmails.size > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                  >
                    <span className="text-xs font-bold text-teal-400 bg-teal-500/10 px-3 py-1.5 rounded-full border border-teal-500/20">
                      {selectedEmails.size} selected
                    </span>
                    <button 
                      onClick={handleSaveSelected}
                      disabled={isSavingSelected}
                      className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                    >
                      {isSavingSelected ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                      Add to Project
                    </button>
                  </motion.div>
                )}
                <button 
                  onClick={handleExportToSheets}
                  disabled={isExporting}
                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-500/20 transition-all flex items-center gap-2"
                >
                  {isExporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                  Export
                </button>
                <button 
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-400 border border-white/10 transition-colors"
                >
                  {selectedEmails.size === results.emails.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="px-3 py-1.5 bg-white/5 rounded-lg text-xs font-medium text-slate-400 border border-white/10">
                  {results.emails.length} Emails Found
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.emails.map((lead, idx) => (
                <motion.div 
                  key={lead.email}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleToggleSelect(lead.email)}
                  className={cn(
                    "bg-surface-dark border rounded-2xl p-6 transition-all group cursor-pointer relative overflow-hidden",
                    selectedEmails.has(lead.email) ? "border-teal-500/50 bg-teal-500/5" : "border-white/5 hover:border-teal-500/30"
                  )}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={cn(
                      "size-5 rounded border transition-all flex items-center justify-center",
                      selectedEmails.has(lead.email) ? "bg-teal-500 border-teal-500" : "border-white/20 bg-black/20"
                    )}>
                      {selectedEmails.has(lead.email) && <Check className="size-3 text-white" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {lead.confidence >= 80 ? (
                        <ShieldCheck className="size-5 text-emerald-500" />
                      ) : (
                        <div className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
                          {lead.confidence}% Match
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <h3 className={cn(
                      "font-bold transition-colors",
                      selectedEmails.has(lead.email) ? "text-teal-400" : "text-white group-hover:text-teal-400"
                    )}>
                      {lead.first_name} {lead.last_name}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {lead.position || 'Professional'}
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                    <Mail className="size-3 text-slate-600" />
                      <span className="text-xs text-slate-400">{lead.email}</span>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); saveContact(lead); }}
                    className="w-full py-2 bg-white/5 hover:bg-teal-500 hover:text-white text-slate-400 text-xs font-bold rounded-xl border border-white/10 hover:border-teal-500/50 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="size-3" />
                    Save Contact
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : results && results.emails.length === 0 && !isSearching ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 bg-surface-dark/50 border border-dashed border-white/10 rounded-[3rem] text-center"
          >
            <div className="size-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="size-8 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No leads found</h3>
            <p className="text-slate-500 max-w-sm px-6">
              No leads found for this search. Try broadening your parameters or checking the domain spelling.
            </p>
          </motion.div>
        ) : !isSearching && (
          <div className="flex flex-col items-center justify-center py-20 bg-surface-dark/50 border border-dashed border-white/10 rounded-[3rem]">
            <div className="size-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <Search className="size-8 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Ready to find leads?</h3>
            <p className="text-slate-500 max-w-xs text-center">
              Search for a company domain or use the AI Assistant to get started.
            </p>
          </div>
        )}
      </AnimatePresence>

      {/* SEARCH HISTORY DRAWER */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface-dark border-l border-white/10 z-[101] flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <History className="size-5 text-teal-400" />
                    Search Library
                  </h2>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Your recent lead searches</p>
                </div>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="size-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-slate-400 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="size-8 text-teal-500 animate-spin mb-4" />
                    <p className="text-sm text-slate-500 font-medium">Loading history...</p>
                  </div>
                ) : savedSearches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-10">
                    <div className="size-20 bg-white/5 rounded-full flex items-center justify-center mb-6 mx-auto">
                      <Search className="size-10 text-slate-700" />
                    </div>
                    <p className="text-slate-500 text-sm font-medium">No saved searches yet. Run your first search to see it here.</p>
                  </div>
                ) : (
                  savedSearches.map((search) => (
                    <button
                      key={search.id}
                      onClick={() => loadSavedSearch(search)}
                      className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-2xl transition-all text-left group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Globe className="size-4 text-slate-400" />
                          <h4 className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors truncate max-w-[200px]">
                            {search.query.replace('Search: ', '')}
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 bg-white/5 px-2 py-0.5 rounded uppercase">
                           {search.results_count} Leads
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                          <span>{new Date(search.created_at || Date.now()).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{new Date(search.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="size-6 bg-teal-500/10 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArrowRight className="size-3 text-teal-400" />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function IcpField({ label, items, onChange, placeholder, icon }: { 
  label: string, 
  items: string[], 
  onChange: (items: string[]) => void, 
  placeholder?: string,
  icon: React.ReactNode
}) {
  const [val, setVal] = useState('');
  
  const add = () => {
    if (val && !items.includes(val)) {
      onChange([...items, val]);
      setVal('');
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
        {icon} {label}
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {items.map(it => (
          <span key={it} className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold rounded flex items-center gap-1">
            {it}
            <button onClick={() => onChange(items.filter(i => i !== it))} className="hover:text-white">
              <X className="size-2" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input 
          type="text" 
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-blue-500/30 transition-all"
        />
        <button onClick={add} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/5 rounded text-blue-400">
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

function ParamPreview({ label, values }: { label: string, values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{label}</p>
      <div className="flex flex-wrap gap-1">
        {values.map(v => (
          <span key={v} className="px-1.5 py-0.5 bg-teal-500/10 text-teal-400 text-[10px] font-medium rounded border border-teal-500/10">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
