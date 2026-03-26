import React, { useState } from 'react';
import { Mail, Plus, RefreshCw, Loader2, User, X } from 'lucide-react';
import { useOutreachApi } from '@/hooks/useOutreachApi';

interface Alias {
  email: string;
  name: string;
}

interface AliasManagerProps {
  mailboxId: string;
  initialAliases: Alias[];
  provider: 'gmail' | 'outlook' | 'smtp';
  onAliasesUpdated: (newAliases: Alias[]) => void;
}

export const AliasManager: React.FC<AliasManagerProps> = ({
  mailboxId,
  initialAliases,
  provider,
  onAliasesUpdated,
}) => {
  const { addAlias, syncGmailAliases } = useOutreachApi();
  const [aliases, setAliases] = useState<Alias[]>(initialAliases || []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const result = await syncGmailAliases(mailboxId);
      if (result.aliases) {
        setAliases(result.aliases);
        onAliasesUpdated(result.aliases);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync aliases');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setIsAdding(true);
    setError(null);
    try {
      const result = await addAlias(mailboxId, newEmail, newName);
      if (result.aliases) {
        setAliases(result.aliases);
        onAliasesUpdated(result.aliases);
        setNewEmail('');
        setNewName('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add alias');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-slate-700/50 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Mail className="w-4 h-4 text-teal-400" />
          Email Aliases
        </h4>
        {provider === 'gmail' && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="text-xs flex items-center gap-1.5 px-2 py-1 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 rounded-md transition-colors disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync from Gmail
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
          {error}
        </div>
      )}

      {/* Alias List */}
      <div className="grid grid-cols-1 gap-2">
        {aliases.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No aliases configured.</p>
        ) : (
          aliases.map((alias, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 group"
            >
              <div className="flex flex-col">
                <span className="text-sm text-slate-200 font-medium">{alias.email}</span>
                {alias.name && <span className="text-xs text-slate-400">{alias.name}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Alias Form */}
      <form onSubmit={handleAddAlias} className="space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Add New Alias</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email address"
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 pl-8 pr-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors"
              required
            />
          </div>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display Name (optional)"
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 pl-8 pr-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isAdding || !newEmail}
          className="w-full h-8 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-teal-900/20"
        >
          {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add Alias
        </button>
      </form>
    </div>
  );
};
