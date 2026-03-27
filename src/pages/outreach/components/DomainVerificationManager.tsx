import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, Clock, Plus, Trash2, RefreshCcw, Copy, AlertTriangle } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { toast } from 'react-hot-toast';

interface VerifiedDomain {
  id: string;
  domain: string;
  verification_token: string;
  status: 'pending' | 'verified';
  last_verified_at: string | null;
  created_at: string;
}

export default function DomainVerificationManager() {
  const api = useOutreachApi();
  const [domains, setDomains] = useState<VerifiedDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingId, setIsVerifyingId] = useState<string | null>(null);

  const fetchDomains = async () => {
    try {
      const data = await api.fetchVerifiedDomains();
      if (data) setDomains(data);
    } catch (error) {
      console.error('Error fetching domains:', error);
    }
  };

  useEffect(() => {
    if (api.activeProjectId) fetchDomains();
  }, [api.activeProjectId]);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;

    setIsLoading(true);
    try {
      await api.addVerifiedDomain(newDomain);
      setNewDomain('');
      fetchDomains();
      toast.success('Domain registered. Please add the DNS record.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add domain');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (domain: VerifiedDomain) => {
    setIsVerifyingId(domain.id);
    try {
      await api.verifyDomain(domain.id);
      toast.success(`${domain.domain} verified successfully!`);
      fetchDomains();
    } catch (error: any) {
      toast.error(error.message || 'Verification failed. Check your DNS records.');
    } finally {
      setIsVerifyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this domain?')) return;
    try {
      await api.deleteVerifiedDomain(id);
      fetchDomains();
      toast.success('Domain removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove domain');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-400" />
            Verified Domains
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Prove ownership of your domains to enable custom email aliases.
          </p>
        </div>
      </div>

      {/* Add Domain Form */}
      <form onSubmit={handleAddDomain} className="flex gap-2">
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="e.g. example.com"
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50"
        />
        <button
          type="submit"
          disabled={isLoading || !newDomain}
          className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-black font-bold rounded-xl flex items-center gap-2 transition-all"
        >
          {isLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Domain
        </button>
      </form>

      {/* Domain List */}
      <div className="space-y-3">
        {domains.length === 0 ? (
          <div className="text-center py-8 rounded-2xl border border-dashed border-white/8">
            <Shield className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No domains verified for this project</p>
          </div>
        ) : (
          domains.map((domain) => (
            <div key={domain.id} className="bg-black/20 border border-white/5 rounded-2xl overflow-hidden group">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${domain.status === 'verified' ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]' : 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]'}`} />
                  <span className="text-sm font-semibold text-white">{domain.domain}</span>
                  {domain.status === 'verified' ? (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-teal-500/10 text-teal-400 rounded-full border border-teal-500/20">
                      Success
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20">
                      Pending
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {domain.status !== 'verified' && (
                    <button
                      onClick={() => handleVerify(domain)}
                      disabled={isVerifyingId === domain.id}
                      className="px-3 py-1.5 bg-teal-500 text-black rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      {isVerifyingId === domain.id ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Verify
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(domain.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {domain.status === 'pending' && (
                <div className="px-4 pb-4 pt-0">
                  <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-3 w-full">
                        <p className="text-xs text-slate-400">
                          Add this TXT record to your DNS for <span className="text-white font-mono">{domain.domain}</span>
                        </p>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-1">Host / Name</p>
                            <div className="flex items-center justify-between p-2 bg-black/40 border border-white/5 rounded-lg">
                              <code className="text-[11px] text-white">_vultintel-challenge</code>
                              <button onClick={() => copyToClipboard('_vultintel-challenge')} className="text-slate-500 hover:text-white transition-colors">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-black text-slate-600 tracking-widest mb-1">Value</p>
                            <div className="flex items-center justify-between p-2 bg-black/40 border border-white/5 rounded-lg">
                              <code className="text-[11px] text-white break-all">{domain.verification_token}</code>
                              <button onClick={() => copyToClipboard(domain.verification_token)} className="text-slate-500 hover:text-white transition-colors ml-2">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {domain.status === 'verified' && (
                <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-teal-500/40" />
                  <span className="text-[10px] text-slate-500 italic">
                    Verified {domain.last_verified_at ? new Date(domain.last_verified_at).toLocaleDateString() : 'recently'}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
