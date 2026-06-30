import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useSocialApi } from '@/hooks/useSocialApi';
import {
  Send, Clock, FileEdit, Plus, X, Image, Link2, ChevronDown,
  Linkedin, Twitter, Youtube, Facebook, Instagram, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

const PLATFORM_META: Record<string, { icon: any; color: string; bg: string; label: string; charLimit?: number }> = {
  linkedin:  { icon: Linkedin,  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30',   label: 'LinkedIn',  charLimit: 3000 },
  facebook:  { icon: Facebook,  color: 'text-blue-500',   bg: 'bg-blue-600/10 border-blue-600/30',   label: 'Facebook',  charLimit: 63206 },
  instagram: { icon: Instagram, color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/30',   label: 'Instagram', charLimit: 2200 },
  youtube:   { icon: Youtube,   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30',      label: 'YouTube',   charLimit: 5000 },
  twitter:   { icon: Twitter,   color: 'text-sky-400',    bg: 'bg-sky-500/10 border-sky-500/30',      label: 'Twitter/X', charLimit: 280 },
  tiktok:    { icon: ExternalLink, color: 'text-white',   bg: 'bg-white/5 border-white/20',           label: 'TikTok',    charLimit: 2200 },
};

interface ComposeViewProps {
  accounts: any[];
  loadingAccounts: boolean;
  onPostCreated: () => void;
  onNavigateToAccounts: () => void;
}

export default function ComposeView({ accounts, loadingAccounts, onPostCreated, onNavigateToAccounts }: ComposeViewProps) {
  const api = useSocialApi();
  const [body, setBody] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const lowestCharLimit = Math.min(
    ...Array.from(selectedAccountIds)
      .map(id => accounts.find(a => a.id === id)?.platform)
      .filter(Boolean)
      .map(p => PLATFORM_META[p]?.charLimit || 99999)
  ) || 99999;

  const charCount = body.length;
  const isOverLimit = lowestCharLimit !== 99999 && charCount > lowestCharLimit;

  const handleSubmit = async (mode: 'draft' | 'schedule' | 'now') => {
    if (!body.trim()) return toast.error('Write something first!');
    if (selectedAccountIds.size === 0) return toast.error('Select at least one account');
    if (mode === 'schedule' && !scheduledAt) return toast.error('Pick a date/time to schedule');
    if (isOverLimit) return toast.error(`Text exceeds character limit for one of your platforms`);

    setIsSubmitting(true);
    try {
      const post = await api.createPost({
        body,
        link_url: linkUrl || undefined,
        scheduled_at: mode === 'schedule' ? scheduledAt : undefined,
        account_ids: Array.from(selectedAccountIds),
        status: mode === 'draft' ? 'draft' : mode === 'now' ? 'scheduled' : 'scheduled',
      });

      if (mode === 'now') {
        await api.publishNow(post.id);
        toast.success('🚀 Published!');
      } else if (mode === 'schedule') {
        toast.success('📅 Scheduled!');
      } else {
        toast.success('📝 Saved as draft');
      }

      setBody('');
      setSelectedAccountIds(new Set());
      setScheduledAt('');
      setLinkUrl('');
      onPostCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto p-8 space-y-6">

        {/* No accounts CTA */}
        {!loadingAccounts && accounts.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 rounded-2xl border border-violet-500/20 bg-violet-500/5 text-center"
          >
            <div className="size-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <Link2 className="size-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Connect your first account</h3>
            <p className="text-sm text-slate-500 max-w-xs mb-6">
              Connect LinkedIn, YouTube, Facebook, Twitter, or TikTok to start publishing.
            </p>
            <button
              onClick={onNavigateToAccounts}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm transition-colors"
            >
              <Plus className="size-4" /> Connect Account
            </button>
          </motion.div>
        )}

        {accounts.length > 0 && (
          <>
            {/* Account Selector */}
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Post to</p>
              <div className="flex flex-wrap gap-2">
                {accounts.map(account => {
                  const meta = PLATFORM_META[account.platform] || { icon: ExternalLink, color: 'text-slate-400', bg: 'bg-white/5 border-white/20', label: account.platform };
                  const Icon = meta.icon;
                  const selected = selectedAccountIds.has(account.id);
                  return (
                    <button
                      key={account.id}
                      onClick={() => toggleAccount(account.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-200",
                        selected
                          ? `${meta.bg} ${meta.color}`
                          : "border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/5"
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="max-w-[120px] truncate">{account.display_name || account.username}</span>
                      {selected && <X className="size-3 ml-0.5 opacity-60" />}
                    </button>
                  );
                })}
                <button
                  onClick={onNavigateToAccounts}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-white/10 text-slate-600 hover:text-slate-400 text-sm transition-colors"
                >
                  <Plus className="size-3.5" /> Add account
                </button>
              </div>
            </div>

            {/* Composer */}
            <div className={cn(
              "rounded-2xl border overflow-hidden transition-all duration-200",
              isOverLimit ? "border-red-500/50" : "border-white/10 focus-within:border-violet-500/40"
            )}>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="What's on your mind? Write your post here..."
                rows={8}
                className="w-full bg-[#161b22] text-white text-[15px] leading-relaxed p-5 resize-none outline-none placeholder:text-slate-600"
              />
              
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#0d1117] border-t border-white/5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowLinkInput(v => !v)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      showLinkInput ? "bg-violet-500/15 text-violet-300" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                    )}
                  >
                    <Link2 className="size-3.5" /> Link
                  </button>
                </div>
                <div className={cn(
                  "text-xs font-mono tabular-nums transition-colors",
                  isOverLimit ? "text-red-400 font-bold" : charCount > (lowestCharLimit * 0.9) ? "text-amber-400" : "text-slate-600"
                )}>
                  {lowestCharLimit !== 99999 ? `${charCount} / ${lowestCharLimit}` : charCount > 0 ? charCount : ''}
                </div>
              </div>
            </div>

            {/* Link input */}
            <AnimatePresence>
              {showLinkInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-[#161b22] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/40"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Schedule picker */}
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Schedule for (optional)</p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="bg-[#161b22] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-violet-500/40 w-full md:w-auto [color-scheme:dark]"
                min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleSubmit('now')}
                disabled={isSubmitting || isOverLimit}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-violet-500/20"
              >
                <Send className="size-4" />
                {isSubmitting ? 'Publishing...' : 'Post Now'}
              </button>
              {scheduledAt && (
                <button
                  onClick={() => handleSubmit('schedule')}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold text-sm transition-colors"
                >
                  <Clock className="size-4" />
                  Schedule
                </button>
              )}
              <button
                onClick={() => handleSubmit('draft')}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                <FileEdit className="size-4" />
                Save Draft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
