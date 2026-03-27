import React, { useState, useEffect } from 'react';
import { Mail, Plus, Loader2, User, ChevronDown, CheckCircle2, AlertTriangle, ShieldCheck, Globe } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface Identity {
  mailbox_id: string;
  email: string;
  name: string;
  connection_type: string;
  is_alias: boolean;
}

interface Mailbox {
  id: string;
  email: string;
  name?: string;
  connection_type?: string;
}

interface Domain {
  id: string;
  domain: string;
  status: 'verified' | 'pending';
}

interface DomainAliasCardProps {
  domain: Domain;
  mailboxes: Mailbox[];
  onAliasAdded?: () => void;
}

export const DomainAliasCard: React.FC<DomainAliasCardProps> = ({
  domain,
  mailboxes,
  onAliasAdded,
}) => {
  const { addAlias, fetchIdentities } = useOutreachApi();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newPrefix, setNewPrefix] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadIdentities = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIdentities();
      if (data) {
        // Filter identities for this domain
        const domainAliases = data.filter(id => id.email.toLowerCase().endsWith(`@${domain.domain.toLowerCase()}`));
        setIdentities(domainAliases);
      }
    } catch (err: any) {
      console.error("Failed to load identities:", err);
    } finally {
      setLoading(false);
    }
  }, [domain.domain, fetchIdentities]);

  useEffect(() => {
    loadIdentities();
    if (mailboxes.length > 0 && !selectedMailboxId) {
      setSelectedMailboxId(mailboxes[0].id);
    }
  }, [domain.domain, mailboxes, loadIdentities]);

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrefix || !selectedMailboxId) return;

    const fullEmail = `${newPrefix.trim()}@${domain.domain}`;
    setIsAdding(true);
    setError(null);
    try {
      await addAlias(selectedMailboxId, fullEmail, newName);
      toast.success(`Alias ${fullEmail} added successfully`);
      setNewPrefix('');
      setNewName('');
      loadIdentities();
      if (onAliasAdded) onAliasAdded();
    } catch (err: any) {
      const msg = err.message || 'Failed to add alias';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm transition-all hover:border-slate-600/50 shadow-lg shadow-black/20">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
            <Globe className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">{domain.domain}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-teal-400">
                <CheckCircle2 className="w-3 h-3" />
                Verified Domain
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700/50">
        {/* Left: Alias List */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Mail className="w-4 h-4 text-teal-500" />
              Active Aliases
            </h4>
            <span className="text-xs text-slate-500">{identities.length} total</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
              </div>
            ) : identities.length === 0 ? (
              <div className="text-center py-8 bg-slate-800/20 rounded-lg border border-dashed border-slate-700/50">
                <p className="text-xs text-slate-500 italic">No aliases configured for this domain.</p>
              </div>
            ) : (
              identities.map((id, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-700/30 rounded-lg group transition-all hover:bg-slate-800/60"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-slate-200 font-medium truncate">{id.email}</span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3 text-teal-500/70" />
                      Linked to: {mailboxes.find(m => m.id === id.mailbox_id)?.email || 'Unknown Mailbox'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Add Form */}
        <div className="p-5 bg-slate-800/10">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-teal-500" />
            Create New Alias
          </h4>

          <form onSubmit={handleAddAlias} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 ml-1">
                  Alias Email
                </label>
                <div className="flex items-center">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={newPrefix}
                      onChange={(e) => setNewPrefix(e.target.value)}
                      placeholder="e.g. hello"
                      className="w-full bg-slate-800 border border-slate-700 rounded-l-lg py-2 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors"
                      required
                    />
                  </div>
                  <div className="bg-slate-700 border-y border-r border-slate-700 px-3 py-2 text-sm text-slate-400 font-medium rounded-r-lg">
                    @{domain.domain}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 ml-1">
                  Display Name (Optional)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Sales Support"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 ml-1">
                  Primary Sending Identity
                </label>
                <div className="relative">
                  <select
                    value={selectedMailboxId}
                    onChange={(e) => setSelectedMailboxId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-3 pr-10 text-sm text-slate-200 focus:outline-none appearance-none focus:border-teal-500/50 transition-colors"
                    required
                  >
                    <option value="" disabled>Select a mailbox...</option>
                    {mailboxes.map((mb) => (
                      <option key={mb.id} value={mb.id}>
                        {mb.email} ({mb.connection_type === 'gmail' ? 'Gmail' : 'SMTP'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  <span className="text-teal-500/80 font-semibold italic">Note:</span> This alias will be authenticated via the selected account. Ensure your DNS provider allows the primary identity to send on behalf of this domain.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAdding || !newPrefix || !selectedMailboxId || mailboxes.length === 0}
              className="w-full h-10 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-900/20 active:scale-[0.98]"
            >
              {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Provision Alias
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
