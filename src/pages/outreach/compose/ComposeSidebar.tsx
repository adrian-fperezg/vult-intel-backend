import React, { useState, useEffect } from 'react';
import { Loader2, Plus, RefreshCw, Archive, Clock, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOutreachApi } from '@/hooks/useOutreachApi';
import { motion, AnimatePresence } from 'framer-motion';

type Folder = 'draft' | 'scheduled' | 'sent';

interface ComposeSidebarProps {
  currentFolder: Folder;
  setCurrentFolder: (folder: Folder) => void;
  selectedEmailId: string | null;
  setSelectedEmailId: (id: string | null) => void;
  refreshTrigger: number;
}

export default function ComposeSidebar({
  currentFolder,
  setCurrentFolder,
  selectedEmailId,
  setSelectedEmailId,
  refreshTrigger
}: ComposeSidebarProps) {
  const { fetchIndividualEmails } = useOutreachApi();
  const [emails, setEmails] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadEmails = async () => {
    setIsLoading(true);
    try {
      const data = await fetchIndividualEmails(currentFolder);
      setEmails(data || []);
    } catch (err) {
      console.error(`Failed to load ${currentFolder} emails:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmails();
  }, [currentFolder, refreshTrigger, fetchIndividualEmails]);

  const FOLDERS: Array<{ id: Folder; label: string; icon: React.ElementType }> = [
    { id: 'draft', label: 'Drafts', icon: Archive },
    { id: 'scheduled', label: 'Scheduled', icon: Clock },
    { id: 'sent', label: 'Sent', icon: Send },
  ];

  return (
    <div className="w-[320px] shrink-0 border-r border-white/5 bg-[#0d1117] flex flex-col h-full">
      {/* Sidebar Header & Compose Button */}
      <div className="p-4 border-b border-white/5">
        <button
          onClick={() => setSelectedEmailId('new')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(20,184,166,0.15)]"
        >
          <Plus className="size-4" />
          <span>New Email</span>
        </button>
      </div>

      {/* Folder Tabs */}
      <div className="flex px-2 pt-2 gap-1 border-b border-white/5 overflow-x-auto scrollbar-hide">
        {FOLDERS.map(({ id, label, icon: Icon }) => {
          const isActive = currentFolder === id;
          return (
            <button
              key={id}
              onClick={() => {
                setCurrentFolder(id);
                setSelectedEmailId(null);
              }}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors",
                isActive ? "text-teal-400 bg-white/5" : "text-slate-400 hover:text-slate-300 hover:bg-white/5"
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {isActive && (
                <motion.div
                  layoutId="outreach-compose-folder"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal-400"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto p-3 bg-black/20">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {emails.length} {currentFolder}
          </span>
          <button
            onClick={loadEmails}
            disabled={isLoading}
            className="text-slate-500 hover:text-teal-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-teal-500/50" />
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <Archive className="size-4 text-slate-600" />
            </div>
            <p className="text-sm text-slate-500 font-medium">No {currentFolder} emails found.</p>
          </div>
        ) : (
          <div className="space-y-1.5 flex flex-col">
            <AnimatePresence>
              {emails.map((email) => {
                const isSelected = selectedEmailId === email.id;
                return (
                  <motion.button
                    key={email.id}
                    layout="position"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedEmailId(email.id)}
                    className={cn(
                      "text-left p-3 rounded-xl border transition-all duration-200",
                      isSelected 
                        ? "bg-teal-500/10 border-teal-500/30 shadow-[0_0_15px_rgba(20,184,166,0.05)]" 
                        : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-semibold text-white truncate pr-2">
                        {email.to_email || '(No recipient)'}
                      </div>
                      <div className="shrink-0 text-[10px] bg-black/30 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-widest font-bold">
                        {email.status}
                      </div>
                    </div>
                    
                    <div className={cn(
                      "text-[13px] truncate font-medium",
                      email.subject ? "text-slate-300" : "text-slate-500 italic"
                    )}>
                      {email.subject || 'No subject'}
                    </div>

                    <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                      <span className="truncate pr-2">
                        {email.contact_id ? 'Linked to contact' : 'Standalone email'}
                      </span>
                      <span className="shrink-0">
                        {new Date(email.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
