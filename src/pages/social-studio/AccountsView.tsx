import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  Link2, Trash2, ExternalLink, CheckCircle2, Lock,
  Linkedin, Twitter, Youtube, Facebook, Instagram
} from 'lucide-react';

const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    activeBg: 'bg-red-500/15 border-red-500/40',
    description: 'Publish to your YouTube community posts',
    envKey: 'GOOGLE_CLIENT_ID',
    available: true, // Uses existing Google OAuth
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    activeBg: 'bg-blue-500/15 border-blue-500/40',
    description: 'Publish posts to your LinkedIn profile',
    envKey: 'LINKEDIN_CLIENT_ID',
    available: false,
    setupUrl: 'https://www.linkedin.com/developers/apps',
    setupGuide: 'Create a LinkedIn App → get Client ID & Secret → add to Railway vars as LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: Facebook,
    color: 'text-blue-500',
    bg: 'bg-blue-600/10 border-blue-600/20',
    activeBg: 'bg-blue-600/15 border-blue-600/40',
    description: 'Publish to your Facebook Page',
    envKey: 'FACEBOOK_APP_ID',
    available: false,
    setupUrl: 'https://developers.facebook.com/apps',
    setupGuide: 'Create a Meta App → get App ID & Secret → add to Railway as FACEBOOK_APP_ID / FACEBOOK_APP_SECRET',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
    activeBg: 'bg-pink-500/15 border-pink-500/40',
    description: 'Publish to Instagram via Facebook',
    envKey: 'FACEBOOK_APP_ID',
    available: false,
    setupUrl: 'https://developers.facebook.com/apps',
    setupGuide: 'Same as Facebook (uses Meta platform) → link your Instagram Business account to your Page',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: Twitter,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
    activeBg: 'bg-sky-500/15 border-sky-500/40',
    description: 'Publish tweets to your X account',
    envKey: 'TWITTER_CLIENT_ID',
    available: false,
    setupUrl: 'https://developer.twitter.com/en/apps',
    setupGuide: 'Create a Twitter Developer App → get Client ID & Secret → add to Railway as TWITTER_CLIENT_ID / TWITTER_CLIENT_SECRET',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: ExternalLink,
    color: 'text-white',
    bg: 'bg-white/5 border-white/10',
    activeBg: 'bg-white/10 border-white/20',
    description: 'Publish videos to TikTok (video required)',
    envKey: 'TIKTOK_CLIENT_KEY',
    available: false,
    setupUrl: 'https://developers.tiktok.com',
    setupGuide: 'Create a TikTok Developer App → get Client Key & Secret → add to Railway as TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET',
  },
];

const BACKEND_URL = import.meta.env.VITE_OUTREACH_API_URL ?? 'http://localhost:3001';

interface AccountsViewProps {
  accounts: any[];
  loading: boolean;
  onRefresh: () => void;
  api: any;
}

export default function AccountsView({ accounts, loading, onRefresh, api }: AccountsViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null);

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Disconnect ${name}?`)) return;
    setDeletingId(id);
    try {
      await api.deleteAccount(id);
      toast.success(`${name} disconnected`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setDeletingId(null); }
  };

  const handleConnect = (platformId: string) => {
    const url = `${BACKEND_URL}/api/social/auth/${platformId}?project_id=${api.activeProjectId}`;
    window.location.href = url;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto p-8 space-y-4">

        {/* Connected accounts */}
        {accounts.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Connected ({accounts.length})</p>
            <div className="space-y-2">
              {accounts.map(account => {
                const platform = PLATFORMS.find(p => p.id === account.platform);
                const Icon = platform?.icon || ExternalLink;
                return (
                  <motion.div
                    key={account.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex items-center gap-4 p-4 rounded-2xl border", platform?.activeBg || 'bg-white/5 border-white/10')}
                  >
                    <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden">
                      {account.avatar_url
                        ? <img src={account.avatar_url} className="size-full object-cover" />
                        : <Icon className={cn("size-5", platform?.color || 'text-slate-400')} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{account.display_name || account.username}</p>
                      <p className="text-xs text-slate-500 capitalize">{account.platform}</p>
                    </div>
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                    <button
                      onClick={() => handleDisconnect(account.id, account.display_name || account.username)}
                      disabled={deletingId === account.id}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Available platforms */}
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Connect a platform</p>

        {PLATFORMS.map(platform => {
          const connected = accounts.find(a => a.platform === platform.id);
          if (connected) return null;
          const Icon = platform.icon;

          return (
            <motion.div
              key={platform.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("rounded-2xl border overflow-hidden", platform.bg)}
            >
              <div className="flex items-center gap-4 p-4">
                <div className="size-10 rounded-xl bg-black/20 flex items-center justify-center">
                  <Icon className={cn("size-5", platform.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{platform.name}</p>
                  <p className="text-xs text-slate-500">{platform.description}</p>
                </div>

                {platform.available ? (
                  <button
                    onClick={() => handleConnect(platform.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors"
                  >
                    <Link2 className="size-3.5" /> Connect
                  </button>
                ) : (
                  <button
                    onClick={() => setExpandedSetup(expandedSetup === platform.id ? null : platform.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors"
                  >
                    <Lock className="size-3" /> Setup Required
                  </button>
                )}
              </div>

              {/* Setup guide */}
              {expandedSetup === platform.id && !platform.available && (
                <div className="px-5 pb-4 border-t border-white/5 pt-4 space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">{platform.setupGuide}</p>
                  {platform.setupUrl && (
                    <a
                      href={platform.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <ExternalLink className="size-3" /> Open Developer Portal
                    </a>
                  )}
                  <p className="text-xs text-slate-600">
                    After adding the env vars to Railway, this button will become active automatically.
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
