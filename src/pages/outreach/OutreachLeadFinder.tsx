import { useState, useEffect } from 'react';
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
  Zap
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

export default function OutreachLeadFinder() {
  const { projectId } = useParams();
  const api = useOutreachApi();
  
  const [domain, setDomain] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DomainResult | null>(null);
  
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isHunterConnected, setIsHunterConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkHunterConnection = async () => {
      if (projectId) {
        try {
          const settings = await api.fetchSettings(); // Removed projectId
          setIsHunterConnected(settings.hasHunterKey);
        } catch (error) {
          console.error("Failed to fetch settings:", error);
          setIsHunterConnected(false); // Assume not connected if fetch fails
        }
      }
    };
    checkHunterConnection();
  }, [projectId, api]); // Added api to dependencies

  const handleSearch = async (targetDomain: string) => {
    if (!targetDomain) return;
    setIsSearching(true);
    try {
      const data = await api.hunterDomainSearch(targetDomain); // Removed projectId!
      if (data) {
        setResults({
          domain: data.domain,
          organization: data.organization || targetDomain,
          emails: data.emails?.map((e: any) => ({
            first_name: e.first_name,
            last_name: e.last_name,
            email: e.value,
            position: e.position,
            confidence: e.confidence,
            verification_status: e.verification_status
          })) || []
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Domain search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAiAssist = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    try {
      const data = await api.hunterAiAssist(aiPrompt);
      if (data.domains && data.domains.length > 0) {
        setDomain(data.domains[0]);
        handleSearch(data.domains[0]);
        toast.success(`AI suggests: ${data.domains[0]}`);
      } else {
        toast.error("AI couldn't find a domain for that request");
      }
    } catch (error) {
      toast.error("AI Assistant unavailable");
    } finally {
      setIsAiLoading(false);
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
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Zap className="size-8 text-teal-400" />
            Lead Finder
          </h1>
          <p className="text-slate-400">
            Search domains or use AI to discover new leads and their verified contact information.
          </p>
          
          <div className="flex gap-3 pt-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-slate-500 group-focus-within:text-teal-400 transition-colors" />
              <input 
                type="text"
                placeholder="Enter domain (e.g. stripe.com)"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(domain)}
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

        {/* AI Assist Box */}
        <div className="bg-gradient-to-br from-teal-500/10 to-blue-500/10 border border-teal-500/20 rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Sparkles className="size-24 text-teal-400" />
          </div>
          <div className="relative z-10 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="size-5 text-teal-400" />
              AI Assistant
            </h3>
            <p className="text-sm text-slate-400">
              Tell me who you're looking for and I'll find relevant domains.
            </p>
            <textarea 
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. 'Find me tech companies in Berlin focused on sustainability'"
              className="w-full bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-teal-500/30 resize-none h-24 transition-all"
            />
            <button 
              onClick={handleAiAssist}
              disabled={isAiLoading || !aiPrompt}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-teal-400 text-sm font-bold rounded-xl border border-teal-500/30 transition-all flex items-center justify-center gap-2"
            >
              {isAiLoading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Generate Target Domains
            </button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence mode="wait">
        {results ? (
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
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-white/5 rounded-full text-xs font-medium text-slate-400 border border-white/10">
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
                  className="bg-surface-dark border border-white/5 hover:border-teal-500/30 rounded-2xl p-6 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="size-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                      <User className="size-5" />
                    </div>
                    {lead.confidence >= 80 ? (
                      <ShieldCheck className="size-5 text-emerald-500" />
                    ) : (
                      <div className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
                        {lead.confidence}% Match
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <h3 className="font-bold text-white group-hover:text-teal-400 transition-colors">
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
                    onClick={() => saveContact(lead)}
                    className="w-full py-2 bg-white/5 hover:bg-teal-500 hover:text-white text-slate-400 text-xs font-bold rounded-xl border border-white/10 hover:border-teal-500/50 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="size-3" />
                    Save to Contacts
                  </button>
                </motion.div>
              ))}
            </div>
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
    </div>
  );
}
