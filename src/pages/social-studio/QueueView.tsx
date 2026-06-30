import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  Clock, CheckCircle2, AlertCircle, FileEdit, Trash2, Send,
  RefreshCw, Linkedin, Twitter, Youtube, Facebook, Instagram, ExternalLink
} from 'lucide-react';

const PLATFORM_ICONS: Record<string, any> = {
  linkedin: Linkedin, twitter: Twitter, youtube: Youtube,
  facebook: Facebook, instagram: Instagram, tiktok: ExternalLink,
};
const STATUS_STYLES: Record<string, { label: string; color: string; icon: any }> = {
  draft:      { label: 'Draft',      color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: FileEdit },
  scheduled:  { label: 'Scheduled',  color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', icon: Clock },
  publishing: { label: 'Publishing', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: RefreshCw },
  published:  { label: 'Published',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  failed:     { label: 'Failed',     color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: AlertCircle },
};

interface QueueViewProps {
  posts: any[];
  loading: boolean;
  onRefresh: () => void;
  api: any;
}

export default function QueueView({ posts, loading, onRefresh, api }: QueueViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    setDeletingId(id);
    try {
      await api.deletePost(id);
      toast.success('Post deleted');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setDeletingId(null); }
  };

  const handlePublishNow = async (id: string) => {
    setPublishingId(id);
    try {
      await api.publishNow(id);
      toast.success('🚀 Published!');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setPublishingId(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="size-8 border-2 border-t-violet-500 border-white/10 rounded-full animate-spin" />
    </div>
  );

  const grouped = {
    scheduled: posts.filter(p => p.status === 'scheduled'),
    draft: posts.filter(p => p.status === 'draft'),
    published: posts.filter(p => p.status === 'published'),
    failed: posts.filter(p => p.status === 'failed'),
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        {posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="size-16 rounded-2xl bg-violet-500/5 border border-violet-500/10 flex items-center justify-center mb-4">
              <Clock className="size-8 text-violet-500/40" />
            </div>
            <p className="text-slate-500 text-sm">No posts yet. Compose your first post!</p>
          </div>
        )}

        {(['scheduled', 'draft', 'failed', 'published'] as const).map(status => {
          const statusPosts = grouped[status];
          if (!statusPosts.length) return null;
          const style = STATUS_STYLES[status];
          return (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <style.icon className={cn("size-4", style.color.split(' ')[0])} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {style.label} ({statusPosts.length})
                </span>
              </div>
              <div className="space-y-3">
                {statusPosts.map(post => {
                  const targets = typeof post.targets === 'string' ? JSON.parse(post.targets) : (post.targets || []);
                  return (
                    <motion.div
                      key={post.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group relative rounded-2xl bg-[#161b22] border border-white/5 hover:border-white/10 p-5 transition-all"
                    >
                      {/* Status badge */}
                      <div className={cn("absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-tight", style.color)}>
                        <style.icon className="size-2.5" />
                        {style.label}
                      </div>

                      {/* Platforms */}
                      <div className="flex items-center gap-1.5 mb-3">
                        {targets.map((t: any) => {
                          const Icon = PLATFORM_ICONS[t.platform] || ExternalLink;
                          const failed = t.status === 'failed';
                          return (
                            <div key={t.id} title={failed ? t.error_message : t.platform}
                              className={cn("size-6 rounded-full flex items-center justify-center", failed ? "bg-red-500/20" : "bg-white/5")}>
                              <Icon className={cn("size-3", failed ? "text-red-400" : "text-slate-400")} />
                            </div>
                          );
                        })}
                      </div>

                      {/* Body */}
                      <p className="text-sm text-slate-200 leading-relaxed line-clamp-3 pr-20">{post.body}</p>

                      {/* Metadata */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-xs text-slate-600">
                          {post.scheduled_at
                            ? `📅 ${format(parseISO(post.scheduled_at), 'MMM d, yyyy · h:mm a')}`
                            : post.published_at
                            ? `✅ Published ${format(parseISO(post.published_at), 'MMM d, yyyy')}`
                            : 'No date set'}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                            <button
                              onClick={() => handlePublishNow(post.id)}
                              disabled={publishingId === post.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs font-medium transition-colors"
                            >
                              <Send className="size-3" />
                              {publishingId === post.id ? '...' : 'Post now'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(post.id)}
                            disabled={deletingId === post.id}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
