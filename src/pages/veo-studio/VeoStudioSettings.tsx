import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, ExternalLink, CheckCircle2, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useVeoStudioSubscription } from '@/hooks/useVeoStudioSubscription';
import toast from 'react-hot-toast';

type AspectRatio = '16:9' | '9:16' | '1:1';
type Resolution = '720p' | '1080p';
type StylePreset = 'cinematic' | 'documentary' | 'commercial' | 'music-video' | 'nature' | 'action' | 'dreamy';

interface DefaultSettings {
  aspectRatio: AspectRatio;
  resolution: Resolution;
  style: StylePreset;
  autoEnhance: boolean;
}

const STYLE_OPTIONS: StylePreset[] = ['cinematic', 'documentary', 'commercial', 'music-video', 'nature', 'action', 'dreamy'];

interface VeoStudioSettingsProps {
  projectId: string;
}

export default function VeoStudioSettings({ projectId }: VeoStudioSettingsProps) {
  const { currentUser, isFounder } = useAuth();
  const { videosUsed, videosLimit, periodResetAt } = useVeoStudioSubscription();
  const [settings, setSettings] = useState<DefaultSettings>({
    aspectRatio: '16:9',
    resolution: '720p',
    style: 'cinematic',
    autoEnhance: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const apiBase = import.meta.env.VITE_OUTREACH_API_URL || 'http://localhost:3001';

  useEffect(() => {
    async function load() {
      if (!projectId || !currentUser) return;
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${apiBase}/api/veo-studio/default-settings?projectId=${projectId}`, {
          headers: { 
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
    load();
  }, [currentUser, projectId, apiBase]);

  const set = <K extends keyof DefaultSettings>(key: K, value: DefaultSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setIsSaving(true);
    setSavedOk(false);
    try {
      const token = await currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch(`${apiBase}/api/veo-studio/default-settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}`,
          'x-project-id': projectId
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save');
      
      setSavedOk(true);
      toast.success('Settings saved!');
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const isUnlimited = isFounder || videosLimit >= 9999;
  const usagePct = isUnlimited ? 0 : Math.min((videosUsed / videosLimit) * 100, 100);
  const resetDate = periodResetAt ? new Date(periodResetAt).toLocaleDateString() : 'Next billing cycle';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <Settings className="size-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-bold">Settings</h2>
            <p className="text-xs text-slate-500">Manage your subscription and default generation preferences</p>
          </div>
        </div>

        {/* Subscription status */}
        <section className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-amber-400/70">Subscription</h3>

          <div className="flex items-center gap-4 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Film className="size-5 text-amber-400" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">Veo Studio Pack</p>
              <p className="text-xs text-slate-400">Active · $49/month</p>
            </div>
            <a
              href="https://billing.stripe.com/p/login/6oU3cudrxfYM0JdabgbjW00"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 border border-white/8 hover:text-white hover:border-white/20 transition-colors"
            >
              Manage <ExternalLink className="size-3" />
            </a>
          </div>

          {/* Credit usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-medium">Video Credits</span>
              <span className={cn('font-bold tabular-nums', isUnlimited ? 'text-amber-400' : 'text-white')}>
                {isUnlimited ? '∞ Unlimited (Founder)' : `${videosUsed} / ${videosLimit}`}
              </span>
            </div>
            {!isUnlimited && (
              <>
                <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700',
                      usagePct >= 90 ? 'bg-red-500' : usagePct >= 75 ? 'bg-orange-400' : 'bg-amber-400'
                    )}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-600">Resets on {resetDate}</p>
              </>
            )}
          </div>
        </section>

        {/* Default generation settings */}
        <section className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Default Generation Settings</h3>

          {/* Aspect ratio */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Default Aspect Ratio</label>
            <div className="flex gap-2">
              {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  onClick={() => set('aspectRatio', ar)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                    settings.aspectRatio === ar
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  )}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Default Resolution</label>
            <div className="flex gap-2">
              {(['720p', '1080p'] as Resolution[]).map((r) => (
                <button
                  key={r}
                  onClick={() => set('resolution', r)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                    settings.resolution === r
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Default Style Preset</label>
            <select
              value={settings.style}
              onChange={(e) => set('style', e.target.value as StylePreset)}
              className="w-full appearance-none bg-white/[0.03] border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
            >
              {STYLE_OPTIONS.map(s => (
                <option key={s} value={s} className="bg-slate-900 capitalize">{s.replace('-', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Auto-enhance */}
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/6 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-white">Auto-Enhance Prompts</p>
              <p className="text-xs text-slate-500 mt-0.5">Automatically enhance prompts before generation</p>
            </div>
            <button
              onClick={() => set('autoEnhance', !settings.autoEnhance)}
              className={cn(
                'w-11 h-6 rounded-full border transition-all relative',
                settings.autoEnhance
                  ? 'bg-amber-500 border-amber-500'
                  : 'bg-white/10 border-white/15'
              )}
            >
              <div className={cn(
                'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                settings.autoEnhance ? 'left-[22px]' : 'left-0.5'
              )} />
            </button>
          </div>
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm uppercase tracking-widest rounded-xl transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? <><Loader2 className="size-4 animate-spin" /> Saving…</>
          : savedOk ? <><CheckCircle2 className="size-4" /> Saved!</>
          : <><Save className="size-4" /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
